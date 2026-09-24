import type { RelicSlot } from '../domain/types.js';
import type { PlayerRuntimeData, PlayerRuntimeRelicIdentity } from '../player/runtime-data.js';
import {
  RELIC_STAT_REGISTRY,
  isRelicStatKey,
  relicStatSemantics,
  type RelicStatKey
} from './stat-registry.js';

export interface RelicScoreReferenceData {
  schemaVersion: 1;
  mainAt15: Record<RelicSlot, Partial<Record<RelicStatKey, number>>>;
  subHighRoll: Partial<Record<RelicStatKey, number>>;
}

const SLOT_BY_NUMBER = {
  1: 'HEAD',
  2: 'HAND',
  3: 'BODY',
  4: 'FOOT',
  5: 'NECK',
  6: 'OBJECT'
} as const satisfies Record<PlayerRuntimeRelicIdentity['slot'], RelicSlot>;

export function relicSlotFromNumber(slot: PlayerRuntimeRelicIdentity['slot']): RelicSlot {
  return SLOT_BY_NUMBER[slot];
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`[relic-score/reference] ${label}`);
  return value;
}

function affixesInGroup(
  affixes: PlayerRuntimeData['relicMainAffixes'],
  group: string
): Array<[string, PlayerRuntimeData['relicMainAffixes'][string]]> {
  return Object.entries(affixes).filter(([identity]) => identity.startsWith(`${group}:`));
}

function assertClosure(
  actual: Iterable<RelicStatKey>,
  expected: RelicStatKey[],
  label: string
): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right))
    throw new Error(`[relic-score/reference] ${label} closure mismatch`);
}

export function buildRelicScoreReferenceData(runtime: PlayerRuntimeData): RelicScoreReferenceData {
  const fiveStar = Object.values(runtime.relics).filter((identity) => identity.rarity === 5);
  if (!fiveStar.length) throw new Error('[relic-score/reference] no 5-star relics');
  const mainAt15 = Object.fromEntries(
    Object.values(SLOT_BY_NUMBER).map((slot) => [slot, {}])
  ) as RelicScoreReferenceData['mainAt15'];
  const groupBySlot = new Map<RelicSlot, { main: string; sub: string }>();
  for (const relic of fiveStar) {
    const slot = relicSlotFromNumber(relic.slot);
    if (relic.maxLevel !== 15)
      throw new Error(`[relic-score/reference] ${slot} maxLevel must be 15`);
    const groups = { main: relic.mainAffixGroup, sub: relic.subAffixGroup };
    const existing = groupBySlot.get(slot);
    if (existing && (existing.main !== groups.main || existing.sub !== groups.sub))
      throw new Error(`[relic-score/reference] conflicting groups for ${slot}`);
    groupBySlot.set(slot, groups);
  }
  const subGroups = new Set<string>();
  for (const slot of Object.values(SLOT_BY_NUMBER)) {
    const groups = groupBySlot.get(slot);
    if (!groups) throw new Error(`[relic-score/reference] missing 5-star ${slot}`);
    subGroups.add(groups.sub);
    const seen = new Set<RelicStatKey>();
    for (const [identity, affix] of affixesInGroup(runtime.relicMainAffixes, groups.main)) {
      const key = affix.propertyType;
      if (!isRelicStatKey(key) || !relicStatSemantics(key).mainSlots.includes(slot))
        throw new Error(`[relic-score/reference] illegal main ${identity} on ${slot}`);
      if (seen.has(key))
        throw new Error(`[relic-score/reference] duplicate main ${key} on ${slot}`);
      seen.add(key);
      mainAt15[slot][key] = positive(
        affix.baseValue + Number(affix.levelAdd) * 15,
        `main ${slot}:${key}`
      );
    }
    assertClosure(
      seen,
      (Object.keys(RELIC_STAT_REGISTRY) as RelicStatKey[]).filter((key) =>
        relicStatSemantics(key).mainSlots.includes(slot)
      ),
      `main ${slot}`
    );
  }
  if (subGroups.size !== 1)
    throw new Error('[relic-score/reference] conflicting 5-star sub groups');
  const subHighRoll: RelicScoreReferenceData['subHighRoll'] = {};
  const seen = new Set<RelicStatKey>();
  for (const [identity, affix] of affixesInGroup(runtime.relicSubAffixes, [...subGroups][0])) {
    const key = affix.propertyType;
    if (!isRelicStatKey(key) || !RELIC_STAT_REGISTRY[key].sub)
      throw new Error(`[relic-score/reference] illegal sub ${identity}`);
    if (seen.has(key)) throw new Error(`[relic-score/reference] duplicate sub ${key}`);
    if (!Number.isSafeInteger(affix.stepNum) || (affix.stepNum ?? 0) <= 0)
      throw new Error(`[relic-score/reference] invalid StepNum ${identity}`);
    seen.add(key);
    subHighRoll[key] = positive(
      affix.baseValue + Number(affix.stepNum) * Number(affix.stepValue),
      `sub ${key}`
    );
  }
  assertClosure(
    seen,
    (Object.keys(RELIC_STAT_REGISTRY) as RelicStatKey[]).filter(
      (key) => RELIC_STAT_REGISTRY[key].sub
    ),
    'sub'
  );
  return { schemaVersion: 1, mainAt15, subHighRoll };
}
