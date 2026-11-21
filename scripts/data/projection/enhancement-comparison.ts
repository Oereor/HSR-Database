import {
  ENHANCEMENT_COMPARISON_SCHEMA,
  visibleComparisonText,
  type ComparisonCategory,
  type ComparisonItem,
  type ComparisonItemKind,
  type ComparisonSide,
  type ComparisonSkillLevel,
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
  SkillCard,
  SkillProgression
} from '../../../src/lib/domain/types.js';
import type {
  ComparisonAssociation,
  ComparisonDiagnostic,
  EnhancementDomain
} from '../domain/enhancement-comparison.js';
import { params, rows, textSource, type Raw } from '../domain/shared.js';
import type { TextResolver } from '../localization.js';
import { closestAvailableLevel, defaultSkillLevelTarget } from '../skills.js';

type EntryKind =
  | Pick<Extract<ComparisonItemKind, { category: 'skills' }>, 'category' | 'skillCategory'>
  | Exclude<ComparisonItemKind, { category: 'skills' }>;

type Entry = EntryKind & {
  id: string;
  label: string;
  name: string;
  iconKey?: ComparisonItem['iconKey'];
  tokens: DescriptionToken[];
  params: ReturnType<typeof params>;
  skill?: {
    card: SkillCard;
    levels: LevelledDescription[];
    progression?: SkillProgression;
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
        name: variant.name,
        iconKey: variant.iconKey ?? card.iconKey,
        tokens: [],
        params: [],
        skill: {
          card,
          levels: variant.levels,
          progression,
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

function skillLevels(skill: NonNullable<Entry['skill']>): number[] {
  const { progression, levels } = skill;
  return [...new Set(levels.map(({ level }) => level))]
    .filter((level) => {
      if (progression?.fixedLevel !== undefined) return level === progression.fixedLevel;
      if (skill.card.externalCondition) return level === skill.defaultLevel;
      return !progression || progression.availableLevels.includes(level);
    })
    .sort((left, right) => left - right);
}

function sharedSkillLevels(
  left: NonNullable<Entry['skill']>,
  right: NonNullable<Entry['skill']>
): number[] {
  const rightLevels = new Set(skillLevels(right));
  return skillLevels(left).filter((level) => {
    if (!rightLevels.has(level)) return false;
    const before = left.card.externalCondition;
    const after = right.card.externalCondition;
    if (!before && !after) return true;
    const beforeState = before?.states.find((state) => state.level === level);
    const afterState = after?.states.find((state) => state.level === level);
    return (
      !!beforeState &&
      !!afterState &&
      JSON.stringify(beforeState.condition) === JSON.stringify(afterState.condition) &&
      JSON.stringify(beforeState.relatedAvatarIds) === JSON.stringify(afterState.relatedAvatarIds)
    );
  });
}

function chooseLevel(levels: number[], before?: Entry, after?: Entry): number | null {
  if (!levels.length) return null;
  const left = before?.skill;
  const right = after?.skill;
  const preferred =
    left && right
      ? left.defaultLevel === right.defaultLevel
        ? left.defaultLevel
        : undefined
      : (left ?? right)?.defaultLevel;
  return preferred !== undefined && levels.includes(preferred)
    ? preferred
    : closestAvailableLevel(levels, defaultSkillLevelTarget((right ?? left)!.card.category));
}

function itemKind(
  entry: Entry,
  level: number | null,
  additionalLevels: ComparisonSkillLevel[] = []
): ComparisonItemKind {
  if (entry.category === 'skills')
    return { category: 'skills', skillCategory: entry.skillCategory, level, additionalLevels };
  if (entry.category === 'eidolons') return { category: 'eidolons', rank: entry.rank };
  return { category: 'traces', traceType: entry.traceType };
}

interface DescriptionPair {
  level: number | null;
  before: ComparisonText;
  after: ComparisonText;
}

function isComparableLevel(pair: DescriptionPair): pair is ComparisonSkillLevel {
  return pair.level !== null && pair.before.kind === 'available' && pair.after.kind === 'available';
}

function hasVisibleDifference(before: ComparisonText, after: ComparisonText): boolean {
  return (
    before.kind === 'available' &&
    after.kind === 'available' &&
    visibleComparisonText(before.tokens) !== visibleComparisonText(after.tokens)
  );
}

function available(tokens: DescriptionToken[]): ComparisonText {
  return visibleComparisonText(tokens).trim()
    ? { kind: 'available', tokens }
    : { kind: 'unavailable' };
}

const rawSyntax =
  /#(?:\d+\[|\{)|\{(?:[A-Z][A-Z_]*#|NICKNAME\}|TextID#)|<\/?(?:color|unbreak|ruby-note|icon)\b/u;

function profileDescription(entry: Entry, level: number | null): ComparisonText {
  const tokens = entry.skill
    ? (entry.skill.levels.find((candidate) => candidate.level === level)?.descriptionTokens ?? [])
    : entry.tokens;
  return tokens.some((token) => rawSyntax.test(token.value))
    ? { kind: 'unavailable' }
    : available(tokens);
}

function profileSide(entry: Entry, description: ComparisonText): ComparisonSide {
  return { id: entry.id, name: tokensForName(entry.name), description };
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
    const metadata = {
      key,
      label: display.label,
      ...(display.iconKey ? { iconKey: display.iconKey } : {})
    };
    if (!left || !right) {
      const level = display.skill ? chooseLevel(skillLevels(display.skill), left, right) : null;
      const side = profileSide(display, profileDescription(display, level));
      const identity = {
        ...metadata,
        ...itemKind(display, level),
        source: { kind: 'structure' } as const
      };
      return left
        ? [{ ...identity, status: 'removed', before: side, after: null }]
        : [{ ...identity, status: 'added', before: null, after: side }];
    }

    const levels = left.skill && right.skill ? sharedSkillLevels(left.skill, right.skill) : [];
    if (category === 'skills' && !levels.length)
      report('text', key, 'No shared skill level for comparison');

    const source: OfficialComparisonSource | undefined = declaration
      ? {
          kind: 'official',
          declarationId: right.id,
          ...(category === 'skills' ? { pointId: String(declaration.SkillTreeID) } : {}),
          hashes: {}
        }
      : undefined;
    const prefix = category === 'eidolons' ? 'RankDesc' : 'Desc';
    const fieldText = (
      field: string,
      level: number | null,
      parameters?: ReturnType<typeof params>
    ) => {
      const raw = declaration?.[field];
      const ref = textSource(raw)?.ref;
      if (source && ref?.kind === 'hash') source.hashes[field] = ref.hash;
      return project(raw, `${key}${level === null ? '' : `.Lv${level}`}.${field}`, parameters);
    };
    const values = (entry: Entry, level: number | null, simple = false) => {
      if (!entry.skill) return entry.params;
      return params(
        skillRows.get(`${entry.id}:${level}`)?.[simple ? 'SimpleParamList' : 'ParamList']
      );
    };
    const detailed = (level: number | null): DescriptionPair => ({
      level,
      before: fieldText(`${prefix}Before`, level, values(left, level)),
      after: fieldText(`${prefix}After`, level, values(right, level))
    });
    const officialPair = (level: number | null): DescriptionPair => {
      const pair = detailed(level);
      if (
        category !== 'skills' ||
        (pair.before.kind === 'available' && pair.after.kind === 'available')
      )
        return pair;
      const before = fieldText('SimpleDescBefore', level, values(left, level, true));
      const after = fieldText('SimpleDescAfter', level, values(right, level, true));
      return before.kind === 'available' && after.kind === 'available'
        ? { level, before, after }
        : pair;
    };
    const pairs = (levels.length ? levels : [null]).map((level): DescriptionPair =>
      source
        ? officialPair(level)
        : {
            level,
            before: profileDescription(left, level),
            after: profileDescription(right, level)
          }
    );
    const comparable = pairs.filter(isComparableLevel);
    const readable = pairs.flatMap(({ level, before, after }) =>
      level !== null && (before.kind === 'available' || after.kind === 'available') ? [level] : []
    );
    const level = chooseLevel(
      comparable.length
        ? comparable.map((pair) => pair.level)
        : readable.length
          ? readable
          : levels,
      left,
      right
    );
    const selected = pairs.find((pair) => pair.level === level)!;
    const baseSide = profileSide(left, selected.before);
    const enhancedSide = profileSide(right, selected.after);
    const identity = {
      ...metadata,
      ...itemKind(
        display,
        level,
        comparable.filter((pair) => pair.level !== level)
      )
    };

    if (!source) {
      if (pairs.some((pair) => pair.before.kind !== pair.after.kind))
        report('text', key, 'Profile text is available in only one form at a common level');
      const nameChanged =
        visibleComparisonText(baseSide.name) !== visibleComparisonText(enhancedSide.name);
      if (!nameChanged && !pairs.some((pair) => hasVisibleDifference(pair.before, pair.after)))
        return [];
      report(
        'profile-difference',
        key,
        `Visible Profile difference (${left.id} → ${right.id}) without a declaration`
      );
      return [
        {
          ...identity,
          status: 'modified',
          source: { kind: 'profile' },
          before: baseSide,
          after: enhancedSide
        }
      ];
    }

    const normalized = (tokens: DescriptionToken[]) =>
      visibleComparisonText(tokens).trim().replace(/\s+/g, ' ');
    for (const [field, official, profile] of [
      [`${prefix}Before`, selected.before, profileDescription(left, level)],
      [`${prefix}After`, selected.after, profileDescription(right, level)]
    ] as const) {
      if (
        official.kind === 'available' &&
        profile.kind === 'available' &&
        normalized(official.tokens) !== normalized(profile.tokens)
      )
        report(
          'official-profile-text',
          `${key}.${field}`,
          'Official comparison wording differs from the matching Profile description'
        );
    }
    const commentFields = Object.keys(declaration ?? {})
      .filter((field) => /^Comment\d+$/.test(field))
      .sort();
    if (Number(declaration?.CommentIndex ?? 0) !== commentFields.length)
      report('text', key, 'CommentIndex differs from available comment fields');
    const comments = commentFields.flatMap((field) => {
      const result = fieldText(field, null);
      return result.kind === 'available' ? [result.tokens] : [];
    });
    return [
      { ...identity, status: 'modified', source, before: baseSide, after: enhancedSide, comments }
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
