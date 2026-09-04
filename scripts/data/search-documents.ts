import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gameTextToPlain } from '../../src/lib/domain/game-text.js';
import type {
  EndgameSearchNameEntry,
  GlobalSearchIndex
} from '../../src/lib/domain/search-index.js';
import type { EntityKind } from '../../src/lib/domain/types.js';
import {
  SEARCH_DOCUMENT_SCHEMA_VERSION,
  searchTargetKey,
  type SearchDocument
} from '../../src/lib/search/documents.js';
import {
  CHARACTER_NAMING_POLICY_VERSION,
  validatePlayerAliases,
  type CharacterNameSnapshot
} from '../../src/lib/search/name-metadata.js';
import {
  compareSearchText,
  normalizeSearchLabel,
  SEARCH_NORMALIZATION_VERSION
} from '../../src/lib/search/normalization.js';
import { generatedRoot, staticGeneratedRoot } from './paths.js';
import { assertCompletePlayerAliasSkeleton, playerAliasesPath } from './player-aliases.js';
export { playerAliasesPath } from './player-aliases.js';

export type SearchCatalogs = Record<EntityKind, Array<{ id: string; name: string }>>;
export interface SearchBuildInputs {
  official: CharacterNameSnapshot;
  catalogs: SearchCatalogs;
  endgameEnemies: EndgameSearchNameEntry[];
}
export const searchInputsPath = path.join(generatedRoot, 'search-inputs.json');
export const searchBundlePath = path.join(staticGeneratedRoot, 'search.json');

export function buildSearchDocuments(
  inputs: SearchBuildInputs,
  manual: unknown
): GlobalSearchIndex {
  const aliases = validatePlayerAliases(manual, inputs.official);
  assertCompletePlayerAliasSkeleton(aliases, inputs.official);
  const documents: SearchDocument[] = [];
  for (const kind of ['character', 'light-cone', 'relic', 'enemy'] as const) {
    for (const catalog of inputs.catalogs[kind]) {
      const names = kind === 'character' ? inputs.official.characters[catalog.id] : undefined;
      if (kind === 'character' && (!names || names.canonicalName !== gameTextToPlain(catalog.name)))
        throw new Error(`角色 ${catalog.id} 名称缓存与 catalog 不一致；请运行 pnpm data:sync`);
      const target = { kind, id: catalog.id };
      documents.push({
        key: searchTargetKey(target),
        target,
        canonicalName: names?.canonicalName ?? gameTextToPlain(catalog.name),
        officialAliases: names?.officialAliases.map(({ value }) => value) ?? [],
        playerAliases:
          kind === 'character' ? (aliases.characters[catalog.id]?.playerAliases ?? []) : []
      });
    }
  }
  if (inputs.catalogs.character.length !== Object.keys(inputs.official.characters).length)
    throw new Error('官方角色 metadata 与 catalog 数量不一致');
  for (const entry of inputs.endgameEnemies) {
    const target = { kind: 'endgame-name' as const, entryId: entry.entryId };
    documents.push({
      key: searchTargetKey(target),
      target,
      canonicalName: gameTextToPlain(entry.name),
      officialAliases: [],
      playerAliases: []
    });
  }
  documents.sort((a, b) => compareSearchText(a.key, b.key));
  const metadataDigest = createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: SEARCH_DOCUMENT_SCHEMA_VERSION,
        normalizationVersion: SEARCH_NORMALIZATION_VERSION,
        namingPolicyVersion: CHARACTER_NAMING_POLICY_VERSION,
        official: inputs.official,
        aliases
      })
    )
    .digest('hex');
  const bundle: GlobalSearchIndex = {
    schemaVersion: SEARCH_DOCUMENT_SCHEMA_VERSION,
    normalizationVersion: SEARCH_NORMALIZATION_VERSION,
    namingPolicyVersion: CHARACTER_NAMING_POLICY_VERSION,
    sourceCommit: inputs.official.sourceCommit,
    metadataDigest,
    documents,
    endgameEnemies: inputs.endgameEnemies
  };
  validateSearchTargets(bundle, inputs.catalogs);
  return bundle;
}

export function validateSearchTargets(bundle: GlobalSearchIndex, catalogs: SearchCatalogs): void {
  const targets = new Set(
    Object.entries(catalogs).flatMap(([kind, entries]) => entries.map(({ id }) => `${kind}:${id}`))
  );
  for (const entry of bundle.endgameEnemies) targets.add(`endgame-name:${entry.entryId}`);
  const seen = new Set<string>();
  for (const doc of bundle.documents) {
    if (
      doc.key !== searchTargetKey(doc.target) ||
      !targets.has(doc.key) ||
      seen.has(doc.key) ||
      !normalizeSearchLabel(doc.canonicalName)
    )
      throw new Error(`无效 SearchDocument target：${doc.key}`);
    seen.add(doc.key);
  }
  if (seen.size !== targets.size) throw new Error('SearchDocument 未覆盖全部 targets');
}

export async function loadPlayerAliases(file = playerAliasesPath): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

/** Alias-only edits rebuild search artifacts, never full domain data or tracked snapshots. */
export async function ensureSearchDocuments(
  expectedSourceCommit: string,
  files = { inputs: searchInputsPath, bundle: searchBundlePath, aliases: playerAliasesPath }
): Promise<boolean> {
  const inputs = JSON.parse(await readFile(files.inputs, 'utf8')) as SearchBuildInputs;
  if (
    inputs.official.schemaVersion !== 1 ||
    inputs.official.sourceCommit !== expectedSourceCommit ||
    inputs.official.normalizationVersion !== SEARCH_NORMALIZATION_VERSION ||
    inputs.official.namingPolicyVersion !== CHARACTER_NAMING_POLICY_VERSION
  )
    throw new Error('名称生成缓存已过期；请运行 pnpm data:sync');
  const next = buildSearchDocuments(inputs, await loadPlayerAliases(files.aliases));
  const serialized = `${JSON.stringify(next)}\n`;
  if ((await readFile(files.bundle, 'utf8').catch(() => '')) === serialized) return false;
  await writeFile(files.bundle, serialized, 'utf8');
  console.log(
    `搜索数据已更新：${next.documents.length} documents，metadata ${next.metadataDigest.slice(0, 12)}`
  );
  return true;
}
