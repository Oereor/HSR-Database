import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  COMPARISON_CATEGORIES,
  ENHANCEMENT_COMPARISON_SCHEMA,
  enhancementComparisonArtifact,
  type ComparisonCategory,
  type EnhancementComparison
} from '../../../src/lib/domain/enhancement-comparison.js';
import type {
  Character,
  CharacterProfile,
  DescriptionToken
} from '../../../src/lib/domain/types.js';
import { loadCharacterDomainTables } from '../character-sources.js';
import { buildCharacterDomain } from '../domain/character.js';
import {
  buildEnhancementComparisons,
  enhancementDeclarationTables
} from '../domain/enhancement-comparison.js';
import { createTextResolver, type Locale, type TextMap } from '../localization.js';
import {
  comparisonSkillRows,
  projectEnhancementComparison
} from '../projection/enhancement-comparison.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const decimalId = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+$/.test(value);
const isTokens = (value: unknown): value is DescriptionToken[] =>
  Array.isArray(value) &&
  value.every(
    (token: unknown) =>
      isRecord(token) &&
      typeof token.value === 'string' &&
      ['text', 'scaling-value', 'fixed-param', 'icon', 'interaction'].includes(
        String(token.type)
      ) &&
      (token.color === undefined ||
        (typeof token.color === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(token.color)))
  );

function isSide(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isTokens(value.name) &&
    isRecord(value.description) &&
    (value.description.kind === 'unavailable' ||
      (value.description.kind === 'available' &&
        isTokens(value.description.tokens) &&
        value.description.tokens.length > 0))
  );
}

export function assertEnhancementComparison(
  value: unknown,
  locale: string,
  id: string
): asserts value is EnhancementComparison {
  const fail = (reason: string): never => {
    throw new Error(`[enhancement] ${locale}:${id} ${reason}`);
  };
  if (
    !isRecord(value) ||
    value.schemaVersion !== ENHANCEMENT_COMPARISON_SCHEMA ||
    value.locale !== locale ||
    value.avatarId !== id ||
    !decimalId(value.enhancedId) ||
    (value.seasonId !== undefined && !decimalId(value.seasonId)) ||
    !isTokens(value.name) ||
    !Array.isArray(value.summary) ||
    !value.summary.every(isTokens) ||
    !Array.isArray(value.items)
  )
    return fail('invalid shard identity or content');

  const keys = new Set<string>();
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      !COMPARISON_CATEGORIES.some((category) => category === item.category) ||
      typeof item.key !== 'string' ||
      keys.has(item.key) ||
      typeof item.label !== 'string' ||
      !isRecord(item.source)
    )
      return fail('invalid or duplicate comparison item');
    keys.add(item.key);
    const key = item.key;
    const { source, status, before, after } = item;
    if (status === 'added' || status === 'removed') {
      const validSides =
        status === 'added' ? before === null && isSide(after) : isSide(before) && after === null;
      if (source.kind !== 'structure' || !validSides) return fail(`invalid structure item ${key}`);
      continue;
    }
    if ((status !== 'modified' && status !== 'unchanged') || !isSide(before) || !isSide(after))
      return fail(`invalid paired item ${key}`);
    if (source.kind === 'profile') continue;
    if (
      source.kind !== 'official' ||
      status !== 'modified' ||
      !isRecord(after) ||
      source.declarationId !== after.id ||
      (item.category === 'skills' && !decimalId(source.pointId)) ||
      !isRecord(source.hashes) ||
      !Object.values(source.hashes).every(decimalId) ||
      (item.presentation !== 'detailed' && item.presentation !== 'simple') ||
      !Array.isArray(item.comments) ||
      !item.comments.every(isTokens) ||
      (item.simple !== undefined &&
        (!isRecord(item.simple) || !isTokens(item.simple.before) || !isTokens(item.simple.after)))
    )
      return fail(`invalid official item ${key}`);
  }
}

export function comparisonProfileIds(
  profile: CharacterProfile
): Record<ComparisonCategory, Set<string>> {
  return {
    skills: new Set(profile.skillCards.flatMap(({ variants }) => variants.map(({ id }) => id))),
    traces: new Set(profile.traces.map(({ id }) => id)),
    eidolons: new Set(profile.eidolons.map(({ id }) => id))
  };
}

export function assertComparisonProfileReferences(
  comparison: EnhancementComparison,
  profiles: Record<'before' | 'after', ReturnType<typeof comparisonProfileIds>>
): void {
  for (const form of ['before', 'after'] as const) {
    const used = new Set<string>();
    for (const item of comparison.items) {
      const side = item[form];
      if (!side) continue;
      const key = `${item.category}:${side.id}`;
      if (!profiles[form][item.category].has(side.id) || used.has(key))
        throw new Error(
          `[enhancement] ${comparison.avatarId} invalid ${form} Profile reference ${key}`
        );
      used.add(key);
    }
  }
}

export async function validateEnhancementComparisonSemantics(
  rawRoot: string,
  generatedRoot: string,
  comparisonIds: string[],
  textMaps: Record<Locale, TextMap>
): Promise<void> {
  const tables = await loadCharacterDomainTables(rawRoot);
  const { characters } = buildCharacterDomain({ tables });
  const byId = new Map(characters.map((character) => [character.id, character]));
  const { comparisons, diagnostics } = buildEnhancementComparisons(tables, characters);
  const sourceIds = comparisons.map(({ avatarId }) => avatarId).sort();
  if (!isDeepStrictEqual(sourceIds, [...comparisonIds].sort()))
    throw new Error('[enhancement] Enhanced character inventory differs from locked source');
  const skillRows = comparisonSkillRows(tables);
  const read = async (relative: string) =>
    JSON.parse(await readFile(path.join(generatedRoot, relative), 'utf8')) as unknown;
  for (const locale of ['zh-CN', 'en'] as const) {
    const resolver = await createTextResolver(
      { locale, textMapCode: locale === 'en' ? 'EN' : 'CHS' },
      textMaps[locale]
    );
    const covered = { skills: 0, traces: 0, eidolons: 0 };
    const textDiagnostics = [];
    for (const comparison of comparisons) {
      const character = byId.get(comparison.avatarId)!;
      const detail = (await read(
        `views/${locale}/details/characters/${comparison.avatarId}.json`
      )) as Character;
      const expected = projectEnhancementComparison(
        comparison,
        character,
        detail,
        resolver,
        skillRows
      );
      textDiagnostics.push(...expected.diagnostics);
      const published = await read(enhancementComparisonArtifact(locale, comparison.avatarId));
      assertEnhancementComparison(published, locale, comparison.avatarId);
      if (!isDeepStrictEqual(published, expected.comparison))
        throw new Error(
          `[enhancement] ${locale}:${comparison.avatarId} differs from locked source`
        );
      for (const item of published.items)
        if (item.source.kind === 'official') covered[item.category]++;
    }
    for (const category of COMPARISON_CATEGORIES) {
      const table = enhancementDeclarationTables[category];
      const expected = tables[table].length;
      if (covered[category] !== expected)
        console.warn(
          `[enhancement] ${locale} ${table} covered ${covered[category]}/${expected}; inspect data sync audit for association diagnostics`
        );
    }
    console.log(
      `[enhancement] ${locale} characters=${sourceIds.length} official=${JSON.stringify(covered)} associationDiagnostics=${diagnostics.length} projectionDiagnostics=${textDiagnostics.length}`
    );
  }
}
