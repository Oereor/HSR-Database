import {
  ENHANCEMENT_COMPARISON_SCHEMA,
  visibleComparisonText,
  type ComparisonCategory,
  type ComparisonItem,
  type ComparisonItemKind,
  type ComparisonSide,
  type ComparisonText,
  type EnhancementComparison,
  type OfficialComparisonSource
} from '../../../src/lib/domain/enhancement-comparison.js';
import { parseGameText, unsupportedGameTextTags } from '../../../src/lib/domain/game-text.js';
import type { CharacterDomain, NeutralCharacterProfile } from '../../../src/lib/domain/neutral.js';
import type {
  Character,
  CharacterProfile,
  DescriptionToken,
  LevelledDescription,
  SkillCard
} from '../../../src/lib/domain/types.js';
import type {
  ComparisonAssociation,
  ComparisonDiagnostic,
  EnhancementDomain
} from '../domain/enhancement-comparison.js';
import { params, rows, textSource, type Raw } from '../domain/shared.js';
import type { TextResolver } from '../localization.js';
import { closestAvailableLevel, defaultSkillLevelTarget } from '../skills.js';

type Entry = ComparisonItemKind & {
  id: string;
  label: string;
  name: string;
  iconKey?: ComparisonItem['iconKey'];
  tokens: DescriptionToken[];
  params: ReturnType<typeof params>;
  skill?: {
    card: SkillCard;
    levels: LevelledDescription[];
    defaultLevel: number | undefined;
  };
};

export function comparisonSkillRows(tables: Record<string, unknown>): Map<string, Raw> {
  return new Map(
    rows(tables, 'AvatarSkillConfig').map((row) => [`${row.SkillID}:${row.Level ?? 1}`, row])
  );
}

const tokensForName = (name: string): DescriptionToken[] =>
  parseGameText(name).map((token) => ({ ...token, type: token.icon ? 'icon' : 'text' }));

function entries(
  profile: CharacterProfile,
  neutral: NeutralCharacterProfile
): Record<ComparisonCategory, Map<string, Entry>> {
  const skills = profile.skillCards.flatMap((card) =>
    card.variants.map((variant): Entry => {
      const progression = card.progressions.find((entry) => entry.id === variant.progressionId);
      return {
        id: variant.id,
        category: 'skills',
        skillCategory: card.category,
        label: card.displayLabel,
        level: null,
        name: variant.name,
        iconKey: variant.iconKey ?? card.iconKey,
        tokens: [],
        params: [],
        skill: {
          card,
          levels: variant.levels,
          defaultLevel:
            progression?.fixedLevel ?? progression?.defaultLevel ?? variant.levels[0]?.level
        }
      };
    })
  );
  const traces = profile.traces.map((trace): Entry => ({
    id: trace.id,
    category: 'traces',
    traceType: trace.type,
    name: trace.name,
    label: '',
    iconKey: trace.iconKey,
    tokens: trace.descriptionTokens ?? [],
    params: [...(neutral.traces.find(({ id }) => trace.id === id)?.params ?? [])]
  }));
  const eidolons = profile.eidolons.map((rank): Entry => ({
    id: rank.id,
    category: 'eidolons',
    rank: rank.rank,
    name: rank.name,
    label: '',
    iconKey: rank.iconKey,
    tokens: rank.descriptionTokens ?? [],
    params: [...(neutral.eidolons.find(({ id }) => rank.id === id)?.params ?? [])]
  }));
  const byId = (items: Entry[]) => new Map(items.map((entry) => [entry.id, entry]));
  return { skills: byId(skills), traces: byId(traces), eidolons: byId(eidolons) };
}

function chooseLevel(before?: Entry, after?: Entry): number | null {
  if (!before?.skill || !after?.skill) return (before ?? after)?.skill?.defaultLevel ?? null;
  const left = before.skill;
  const right = after.skill;
  if (
    left.defaultLevel !== undefined &&
    left.defaultLevel === right.defaultLevel &&
    left.levels.some(({ level }) => level === left.defaultLevel) &&
    right.levels.some(({ level }) => level === right.defaultLevel)
  )
    return left.defaultLevel;
  const inBoth = left.levels
    .map(({ level }) => level)
    .filter((level) => right.levels.some((entry) => entry.level === level))
    .sort((a, b) => a - b);
  return inBoth.length
    ? closestAvailableLevel(inBoth, defaultSkillLevelTarget(right.card.category))
    : null;
}

function itemKind(entry: Entry, level: number | null): ComparisonItemKind {
  if (entry.category === 'skills')
    return { category: 'skills', skillCategory: entry.skillCategory, level };
  if (entry.category === 'eidolons') return { category: 'eidolons', rank: entry.rank };
  return { category: 'traces', traceType: entry.traceType };
}

function available(tokens: DescriptionToken[]): ComparisonText {
  return visibleComparisonText(tokens).trim()
    ? { kind: 'available', tokens }
    : { kind: 'unavailable' };
}

const rawSyntax =
  /#(?:\d+\[|\{)|\{(?:[A-Z][A-Z_]*#|NICKNAME\}|TextID#)|<\/?(?:color|unbreak|ruby-note|icon)\b/u;

function profileSide(entry: Entry, level: number | null): ComparisonSide {
  const tokens = entry.skill
    ? (entry.skill.levels.find((candidate) => candidate.level === level)?.descriptionTokens ?? [])
    : entry.tokens;
  return {
    id: entry.id,
    name: tokensForName(entry.name),
    description: tokens.some((token) => rawSyntax.test(token.value))
      ? { kind: 'unavailable' }
      : available(tokens)
  };
}

export function projectEnhancementComparison(
  domain: EnhancementDomain,
  character: CharacterDomain,
  view: Character,
  resolver: TextResolver,
  skillRows: ReadonlyMap<string, Raw>
): { comparison: EnhancementComparison; diagnostics: ComparisonDiagnostic[] } {
  if (!character.profiles.enhanced || !view.profiles.enhanced)
    throw new Error(`[enhancement] Missing projected profiles ${domain.avatarId}`);
  const before = entries(view.profiles.base, character.profiles.base);
  const after = entries(view.profiles.enhanced, character.profiles.enhanced);
  const diagnostics: ComparisonDiagnostic[] = [];
  const report = (code: ComparisonDiagnostic['code'], field: string, reason: string) =>
    diagnostics.push({ avatarId: domain.avatarId, code, field, reason });

  function project(raw: unknown, field: string, parameters = params([])): ComparisonText {
    const source = textSource(raw);
    if (source?.ref.kind !== 'hash') {
      report('text', field, 'Missing or invalid TextMap Hash');
      return { kind: 'unavailable' };
    }
    const result = resolver.projectGameText(
      { kind: 'parameterized', ref: source.ref, params: parameters },
      {
        gender: character.gender,
        provenance: { entity: 'enhancement-comparison', id: domain.avatarId, field },
        diagnosticDisposition: {
          requirement: 'optional',
          visibility: 'emitted',
          fallbackUsed: true,
          productRouteReachability: 'reachable'
        }
      }
    );
    if (result.status !== 'available') {
      report(
        'text',
        field,
        `TextMap ${source.ref.hash}: ${'reason' in result ? result.reason : result.status}`
      );
      return { kind: 'unavailable' };
    }
    const { tokens, markup, diagnostics: formatDiagnostics } = result.value;
    const unsupported = unsupportedGameTextTags(markup);
    if (
      formatDiagnostics.length ||
      unsupported.length ||
      tokens.some((token) => rawSyntax.test(token.value))
    ) {
      report(
        'text',
        field,
        `TextMap ${source.ref.hash}: unresolved parameter or unsupported markup`
      );
      return { kind: 'unavailable' };
    }
    const description = available(tokens);
    if (description.kind === 'unavailable') report('text', field, 'No visible text');
    return description;
  }

  function itemsFor(association: ComparisonAssociation): ComparisonItem[] {
    const { category, beforeId, afterId, declaration } = association;
    const left = beforeId ? before[category].get(beforeId) : undefined;
    const right = afterId ? after[category].get(afterId) : undefined;
    const display = right ?? left;
    const key = `${category}:${beforeId ?? afterId}`;
    if (!display || (beforeId && !left) || (afterId && !right)) {
      report('association', key, 'Neutral association is missing a localized Profile entity');
      return [];
    }
    const level = chooseLevel(left, right);
    if (category === 'skills' && level === null)
      report('text', key, 'No shared skill level for comparison');
    const metadata = {
      ...itemKind(display, level),
      key,
      label: display.label,
      ...(display.iconKey ? { iconKey: display.iconKey } : {})
    };
    const baseSide = left ? profileSide(left, level) : null;
    const enhancedSide = right ? profileSide(right, level) : null;
    if (baseSide && !enhancedSide)
      return [
        {
          ...metadata,
          status: 'removed',
          source: { kind: 'structure' },
          before: baseSide,
          after: null
        }
      ];
    if (enhancedSide && !baseSide)
      return [
        {
          ...metadata,
          status: 'added',
          source: { kind: 'structure' },
          before: null,
          after: enhancedSide
        }
      ];
    if (!left || !right || !baseSide || !enhancedSide) return [];

    if (!declaration) {
      const nameChanged =
        visibleComparisonText(baseSide.name) !== visibleComparisonText(enhancedSide.name);
      const textChanged =
        baseSide.description.kind === 'available' &&
        enhancedSide.description.kind === 'available' &&
        visibleComparisonText(baseSide.description.tokens) !==
          visibleComparisonText(enhancedSide.description.tokens);
      const status = nameChanged || textChanged ? 'modified' : 'unchanged';
      if (status === 'modified')
        report(
          'profile-difference',
          key,
          `Visible Profile difference (${left.id} → ${right.id}) without a declaration`
        );
      if (baseSide.description.kind !== enhancedSide.description.kind)
        report('text', key, 'Profile text is available in only one form');
      return [
        { ...metadata, status, source: { kind: 'profile' }, before: baseSide, after: enhancedSide }
      ];
    }

    const source: OfficialComparisonSource = {
      kind: 'official',
      declarationId: right.id,
      ...(category === 'skills' ? { pointId: String(declaration.SkillTreeID) } : {}),
      hashes: {}
    };
    const fieldText = (field: string, parameters?: ReturnType<typeof params>) => {
      const raw = declaration[field];
      const text = textSource(raw);
      if (text?.ref.kind === 'hash') source.hashes[field] = text.ref.hash;
      return project(raw, `${key}.${field}`, parameters);
    };
    const values = (entry: Entry, simple: boolean) => {
      if (!entry.skill) return entry.params;
      const row = skillRows.get(`${entry.id}:${level}`);
      return params(row?.[simple ? 'SimpleParamList' : 'ParamList']);
    };
    const prefix = category === 'eidolons' ? 'RankDesc' : 'Desc';
    let beforeText = fieldText(`${prefix}Before`, values(left, false));
    let afterText = fieldText(`${prefix}After`, values(right, false));
    const simpleBefore =
      category === 'skills' ? fieldText('SimpleDescBefore', values(left, true)) : undefined;
    const simpleAfter =
      category === 'skills' ? fieldText('SimpleDescAfter', values(right, true)) : undefined;
    const simple =
      simpleBefore?.kind === 'available' && simpleAfter?.kind === 'available'
        ? { before: simpleBefore.tokens, after: simpleAfter.tokens }
        : undefined;
    const useSimple =
      !!simple && (beforeText.kind === 'unavailable' || afterText.kind === 'unavailable');
    if (useSimple && simple) {
      beforeText = { kind: 'available', tokens: simple.before };
      afterText = { kind: 'available', tokens: simple.after };
    }
    const commentFields = Object.keys(declaration)
      .filter((field) => /^Comment\d+$/.test(field))
      .sort();
    if (Number(declaration.CommentIndex ?? 0) !== commentFields.length)
      report('text', key, 'CommentIndex differs from available comment fields');
    const comments = commentFields.flatMap((field) => {
      const result = fieldText(field);
      return result.kind === 'available' ? [result.tokens] : [];
    });
    return [
      {
        ...metadata,
        status: 'modified',
        source,
        before: { ...baseSide, description: beforeText },
        after: { ...enhancedSide, description: afterText },
        presentation: useSimple ? 'simple' : 'detailed',
        ...(!useSimple && simple ? { simple } : {}),
        comments
      }
    ];
  }

  const summaryFields = Object.keys(domain.hint ?? {})
    .filter((key) => /^EnhancedDesc\d+$/.test(key))
    .sort(
      (a, b) => Number(a.slice('EnhancedDesc'.length)) - Number(b.slice('EnhancedDesc'.length))
    );
  if (domain.hint && Number(domain.hint.EnhancedDescNum) !== summaryFields.length)
    report('summary', 'EnhancedDescNum', 'Summary count differs from available fields');
  const summary = summaryFields.flatMap((field) => {
    const result = project(domain.hint?.[field], `summary.${field}`);
    return result.kind === 'available' ? [result.tokens] : [];
  });
  const items = domain.items.flatMap(itemsFor);
  return {
    comparison: {
      schemaVersion: ENHANCEMENT_COMPARISON_SCHEMA,
      locale: resolver.locale,
      avatarId: domain.avatarId,
      enhancedId: domain.enhancedId,
      name: tokensForName(view.name),
      ...(domain.hint ? { seasonId: String(domain.hint.SeasonID) } : {}),
      summary,
      items
    },
    diagnostics
  };
}
