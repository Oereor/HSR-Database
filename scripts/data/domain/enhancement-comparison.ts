import type {
  CharacterDomain,
  NeutralCharacterProfile,
  NeutralSkillVariant
} from '../../../src/lib/domain/neutral.js';
import type { ComparisonCategory } from '../../../src/lib/domain/enhancement-comparison.js';
import { byId, rows, type Raw } from './shared.js';

export const enhancementDeclarationTables = {
  skills: 'AvatarEnhancedSkill',
  traces: 'AvatarEnhancedSkillTree',
  eidolons: 'AvatarEnhancedRank'
} as const;

const declarationIdFields = {
  skills: 'SkillID',
  traces: 'SkillTreeID',
  eidolons: 'RankID'
} as const;

export interface ComparisonDiagnostic {
  avatarId: string;
  code: 'association' | 'summary' | 'text' | 'profile-difference';
  field: string;
  reason: string;
}

interface Point {
  id: string;
  anchor: string;
  type: string;
  skills: string[];
  parents: string[];
}

interface Slot {
  id: string;
  semanticKind: string;
  points: Point[];
  inConfig?: boolean;
}

export interface ComparisonAssociation {
  category: ComparisonCategory;
  beforeId: string | null;
  afterId: string | null;
  declaration?: Raw;
}

export interface EnhancementDomain {
  avatarId: string;
  enhancedId: string;
  hint?: Raw;
  items: ComparisonAssociation[];
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const unique = (values: string[]) => [...new Set(values)];
const pointSlot = (point: Point) => (point.anchor ? `${point.type}:${point.anchor}` : '');
const samePoint = (before: Point, after: Point) =>
  before.id === after.id || (!!pointSlot(before) && pointSlot(before) === pointSlot(after));

function profilePoints(traceRows: Raw[], enhancedId: string): Point[] {
  const grouped = new Map<string, Point>();
  for (const row of traceRows) {
    if (String(row.EnhancedID ?? 0) !== enhancedId) continue;
    const id = String(row.PointID);
    const point = grouped.get(id) ?? {
      id,
      anchor: String(row.AnchorType ?? ''),
      type: String(row.PointType),
      skills: [],
      parents: []
    };
    point.skills = unique([...point.skills, ...ids(row.LevelUpSkillID)]);
    point.parents = unique([...point.parents, ...ids(row.PrePoint)]);
    grouped.set(id, point);
  }
  return [...grouped.values()];
}

function profileSlots(
  profile: NeutralCharacterProfile,
  config: Raw,
  points: Point[],
  triggerById: ReadonlyMap<string, string>
): Record<ComparisonCategory, Slot[]> {
  const makeSkillSlot = (skill: NeutralSkillVariant): Slot => ({
    id: skill.id,
    semanticKind: [skill.source, skill.category, skill.attackType, triggerById.get(skill.id)]
      .map((part) => part ?? '')
      .join(':'),
    points: points.filter((point) => point.skills.includes(skill.id)),
    inConfig: ids(config.SkillList).includes(skill.id)
  });
  return {
    skills: profile.skills.filter((skill) => skill.visibility !== 'hidden').map(makeSkillSlot),
    traces: profile.traces.map((trace) => ({
      id: trace.id,
      semanticKind: String(trace.sourcePointType),
      points: points.filter((point) => point.id === trace.id)
    })),
    eidolons: profile.eidolons.map((rank) => ({
      id: rank.id,
      semanticKind: String(rank.rank),
      points: [],
      inConfig: ids(config.RankIDList).includes(rank.id)
    }))
  };
}

function candidateSlots(
  category: ComparisonCategory,
  target: Slot,
  own: Slot[],
  opposite: Slot[],
  declaredPoint?: string
): Slot[] {
  const exact = opposite.filter((slot) => slot.id === target.id);
  if (category !== 'eidolons' && exact.length) return exact;
  const comparable = opposite.filter((slot) => slot.semanticKind === target.semanticKind);
  if (category === 'eidolons') return comparable;
  const points = declaredPoint
    ? target.points.filter((point) => point.id === declaredPoint)
    : target.points;
  if (category === 'traces')
    return opposite.filter((slot) =>
      slot.points.some((point) => points.some((targetPoint) => samePoint(point, targetPoint)))
    );
  if (!points.length) {
    return comparable.filter((slot) => !slot.points.length && slot.inConfig === target.inConfig);
  }
  const related = comparable.filter((slot) =>
    slot.points.some((point) => points.some((targetPoint) => samePoint(point, targetPoint)))
  );
  if (related.length <= 1) return related;
  // An ordered slot is evidence only when the same node and semantic group
  // contain the same number of comparable variants in both forms.
  if (points.length !== 1) return related;
  const point = points[0];
  const oppositePoints = new Set(
    related.flatMap((slot) => slot.points.filter((candidate) => samePoint(point, candidate)))
  );
  if (oppositePoints.size !== 1) return related;
  const otherPoint = [...oppositePoints][0];
  const group = point.skills.filter((id) =>
    own.some((slot) => slot.id === id && slot.semanticKind === target.semanticKind)
  );
  const otherGroup = otherPoint.skills.filter((id) => related.some((slot) => slot.id === id));
  if (group.length !== otherGroup.length) return related;
  return related.filter((slot) => slot.id === otherGroup[group.indexOf(target.id)]);
}

function prerequisiteSlots(point: Point, points: Point[]): string[] {
  return point.parents
    .map((id) => {
      const parent = points.find((candidate) => candidate.id === id);
      return parent && pointSlot(parent) ? pointSlot(parent) : id;
    })
    .sort();
}

export function buildEnhancementComparisons(
  tables: Record<string, unknown>,
  characters: CharacterDomain[]
): { comparisons: EnhancementDomain[]; diagnostics: ComparisonDiagnostic[] } {
  const comparisons: EnhancementDomain[] = [];
  const diagnostics: ComparisonDiagnostic[] = [];
  const configs = byId(rows(tables, 'AvatarConfig'), 'AvatarID');
  const enhancedConfigs = byId(rows(tables, 'AvatarConfigEnhanced'), 'AvatarID');
  const traceRows = rows(tables, 'AvatarSkillTreeConfig');
  const triggerById = new Map(
    rows(tables, 'AvatarSkillConfig')
      .filter((row) => Number(row.Level ?? 1) === 1)
      .map((row) => [String(row.SkillID), String(row.SkillTriggerKey ?? '')])
  );
  const hints = rows(tables, 'AvatarEnhancedHintConfig');
  const seasons = byId(rows(tables, 'AvatarEnhancedSeason'), 'SeasonID');
  for (const { id: avatarId, profiles } of characters) {
    if (!profiles.enhanced) continue;
    const config = configs.get(avatarId);
    const enhanced = enhancedConfigs.get(avatarId);
    if (!config || !enhanced) throw new Error(`[enhancement] Missing profile config ${avatarId}`);
    const enhancedId = String(enhanced.EnhancedID);
    const report = (code: ComparisonDiagnostic['code'], field: string, reason: string) =>
      diagnostics.push({ avatarId, code, field, reason });
    const ownerPoints = traceRows.filter((row) => String(row.AvatarID) === avatarId);
    const beforePoints = profilePoints(ownerPoints, '0');
    const afterPoints = profilePoints(ownerPoints, enhancedId);
    const before = profileSlots(profiles.base, config, beforePoints, triggerById);
    const after = profileSlots(profiles.enhanced, enhanced, afterPoints, triggerById);
    const ownerHints = hints.filter(
      (hint) => String(hint.AvatarID) === avatarId && String(hint.EnhancedID) === enhancedId
    );
    const hint = ownerHints.length === 1 ? ownerHints[0] : undefined;
    const validHint = hint && seasons.has(String(hint.SeasonID)) ? hint : undefined;
    if (ownerHints.length && !validHint)
      report('summary', 'AvatarEnhancedHintConfig', 'Ambiguous summary or unknown SeasonID');
    const items: ComparisonAssociation[] = [];
    for (const category of Object.keys(enhancementDeclarationTables) as ComparisonCategory[]) {
      const table = enhancementDeclarationTables[category];
      const field = declarationIdFields[category];
      const declarations = rows(tables, table).filter((row) => String(row.AvatarID) === avatarId);
      const declarationCounts = new Map<string, number>();
      for (const declaration of declarations) {
        const id = String(declaration[field]);
        declarationCounts.set(id, (declarationCounts.get(id) ?? 0) + 1);
      }
      const usedBefore = new Set<string>();
      const usedAfter = new Set<string>();
      const blockedBefore = new Set<string>();
      const blockedAfter = new Set<string>();
      const associate = (target: Slot, declaration?: Raw) => {
        const declaredPoint =
          declaration && category === 'skills' ? String(declaration.SkillTreeID) : undefined;
        const key = `${table}.${target.id}`;
        const candidates = candidateSlots(
          category,
          target,
          after[category],
          before[category],
          declaredPoint
        );
        const block = (reason: string) => {
          blockedAfter.add(target.id);
          for (const candidate of candidates) blockedBefore.add(candidate.id);
          report('association', key, reason);
        };
        if (declaredPoint && !target.points.some((point) => point.id === declaredPoint)) {
          block(`Skill is not linked to declared point ${declaredPoint}`);
          return;
        }
        if (
          (declaration && declarationCounts.get(target.id) !== 1) ||
          usedAfter.has(target.id) ||
          (category === 'eidolons' && !target.inConfig)
        ) {
          block('Duplicate declaration or invalid rank membership');
          return;
        }
        if (!candidates.length && !declaration) return;
        const candidate = candidates[0];
        const reverse =
          candidate && candidateSlots(category, candidate, before[category], after[category]);
        if (
          candidates.length !== 1 ||
          !candidate ||
          usedBefore.has(candidate.id) ||
          (category === 'eidolons' && !candidate.inConfig) ||
          reverse?.length !== 1 ||
          reverse[0].id !== target.id
        ) {
          block(
            `No unique reciprocal match; ordinary candidates: ${candidates.map(({ id }) => id).join(', ') || 'none'}`
          );
          return;
        }
        if (category === 'traces' && candidate.points[0] && target.points[0]) {
          if (
            JSON.stringify(prerequisiteSlots(candidate.points[0], beforePoints)) !==
            JSON.stringify(prerequisiteSlots(target.points[0], afterPoints))
          )
            report('association', key, 'Matched trace has different prerequisite slots');
        }
        usedBefore.add(candidate.id);
        usedAfter.add(target.id);
        items.push({
          category,
          beforeId: candidate.id,
          afterId: target.id,
          ...(declaration ? { declaration } : {})
        });
      };
      for (const declaration of declarations) {
        const id = String(declaration[field]);
        const target = after[category].find((slot) => slot.id === id);
        if (!target)
          report('association', `${table}.${id}`, 'Declaration has no visible enhanced entity');
        else associate(target, declaration);
      }
      for (const slot of after[category]) {
        if (!usedAfter.has(slot.id) && !blockedAfter.has(slot.id)) associate(slot);
      }
      for (const slot of before[category]) {
        if (usedBefore.has(slot.id) || blockedBefore.has(slot.id)) continue;
        const candidates = candidateSlots(category, slot, before[category], after[category]);
        if (!candidates.length) items.push({ category, beforeId: slot.id, afterId: null });
        else {
          for (const candidate of candidates) blockedAfter.add(candidate.id);
          report(
            'association',
            `${table}.${slot.id}`,
            `Unresolved enhanced candidates: ${candidates.map(({ id }) => id).join(', ')}`
          );
        }
      }
      for (const slot of after[category]) {
        if (!usedAfter.has(slot.id) && !blockedAfter.has(slot.id))
          items.push({ category, beforeId: null, afterId: slot.id });
      }
    }
    comparisons.push({ avatarId, enhancedId, items, ...(validHint ? { hint: validHint } : {}) });
  }
  return { comparisons, diagnostics };
}
