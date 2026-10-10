import type { RelicSlot } from '../../domain/types.js';
import type { RelicScoreRecommendation } from '../recommendations.js';
import { RELIC_SLOTS } from '../scoring-config.js';
import { RELIC_STAT_REGISTRY, relicStatSemantics, type RelicStatKey } from '../stat-registry.js';
import type { RatingV2Exceptions } from './overrides.js';

export const MAIN_MAPPING_VERSION = 'avatar-main-slot-max-overrides-v2' as const;
export const SUB_MAPPING_VERSION = 'avatar-sub-flat-4-over-9-v2' as const;
export const UTILITY_VERSION = 'actual-over-high-roll-effective-weight-v2' as const;
export const FLAT_DISCOUNT = 4 / 9;
export const WEIGHT_CATEGORIES = [
  'HP',
  'Attack',
  'Defence',
  'Speed',
  'CriticalChance',
  'CriticalDamage',
  'StatusProbability',
  'StatusResistance',
  'BreakDamage',
  'DamageAddedRatio',
  'SPRatio',
  'HealRatio'
] as const;
export type WeightCategory = (typeof WEIGHT_CATEGORIES)[number];
export type PreferenceRow = Partial<Record<WeightCategory, number>> & { AvatarID: number };
export type PreferenceState =
  | { state: 'present'; preference: number; weight: number }
  | {
      state: 'override';
      preference: number;
      weight: number;
      original: { state: 'missing'; category: WeightCategory };
      reason: string;
      slot: RelicSlot;
    }
  | {
      state: 'missing';
      weight: 0;
      policy: 'nonrecommended-missing-zero-v2' | 'blocked-recommended-missing-v2';
    }
  | { state: 'inapplicable'; weight: 0 };
export interface ProfileAnomaly {
  characterId: string;
  code: 'RECOMMENDED_WEIGHT_MISSING' | 'RECOMMENDED_MAIN_INAPPLICABLE' | 'NO_POSITIVE_MAIN_WEIGHT';
  slot?: RelicSlot;
  key?: RelicStatKey;
  category?: WeightCategory;
}
export interface RatingV2Profile {
  characterId: string;
  element: string;
  status: 'ready' | 'needs-review';
  mainWeights: Partial<Record<RelicStatKey, PreferenceState>>;
  subWeights: Partial<Record<RelicStatKey, PreferenceState>>;
  effectiveSubWeights: Partial<Record<RelicStatKey, number>>;
  slots: Record<
    RelicSlot,
    {
      mode: 'fixed' | 'continuous' | 'explicit-agnostic';
      maximum: number | null;
      reason?: string;
    }
  >;
  recommendation: RelicScoreRecommendation;
  anomalies: ProfileAnomaly[];
  exceptions: RatingV2Exceptions;
}
export interface RatingV2Profiles {
  schemaVersion: 5;
  algorithmVersion: 2;
  sourceCommit: string;
  sourceDigests: Record<string, string>;
  overrideDigest: string;
  mainMappingVersion: typeof MAIN_MAPPING_VERSION;
  subMappingVersion: typeof SUB_MAPPING_VERSION;
  utilityVersion: typeof UTILITY_VERSION;
  semanticDigest: string;
  profiles: RatingV2Profile[];
}

export const STAT_CATEGORY: Record<RelicStatKey, WeightCategory> = {
  HPDelta: 'HP',
  HPAddedRatio: 'HP',
  AttackDelta: 'Attack',
  AttackAddedRatio: 'Attack',
  DefenceDelta: 'Defence',
  DefenceAddedRatio: 'Defence',
  SpeedDelta: 'Speed',
  CriticalChanceBase: 'CriticalChance',
  CriticalDamageBase: 'CriticalDamage',
  StatusProbabilityBase: 'StatusProbability',
  StatusResistanceBase: 'StatusResistance',
  BreakDamageAddedRatioBase: 'BreakDamage',
  SPRatioBase: 'SPRatio',
  HealRatioBase: 'HealRatio',
  PhysicalAddedRatio: 'DamageAddedRatio',
  FireAddedRatio: 'DamageAddedRatio',
  IceAddedRatio: 'DamageAddedRatio',
  ThunderAddedRatio: 'DamageAddedRatio',
  WindAddedRatio: 'DamageAddedRatio',
  QuantumAddedRatio: 'DamageAddedRatio',
  ImaginaryAddedRatio: 'DamageAddedRatio'
};
export const ELEMENT_MAIN: Record<string, RelicStatKey> = {
  Physical: 'PhysicalAddedRatio',
  Fire: 'FireAddedRatio',
  Ice: 'IceAddedRatio',
  Lightning: 'ThunderAddedRatio',
  Thunder: 'ThunderAddedRatio',
  Wind: 'WindAddedRatio',
  Quantum: 'QuantumAddedRatio',
  Imaginary: 'ImaginaryAddedRatio'
};
const FLAT_KEYS = new Set<RelicStatKey>(['HPDelta', 'AttackDelta', 'DefenceDelta']);

/** Values and recommended identity are deliberately independent. No panel or template input. */
export function deriveRatingV2Profile(input: {
  characterId: string;
  element: string;
  main: PreferenceRow;
  sub: PreferenceRow;
  recommendation: RelicScoreRecommendation;
  exceptions?: RatingV2Exceptions;
}): RatingV2Profile {
  const { characterId, element, main, sub, recommendation } = input;
  const exceptions = input.exceptions ?? { mainWeights: [], agnosticSlots: [] };
  const agnosticSlots = new Map(exceptions.agnosticSlots.map((entry) => [entry.slot, entry]));
  if (
    [...exceptions.mainWeights, ...exceptions.agnosticSlots].some(
      (entry) => entry.characterId !== characterId
    )
  )
    throw new Error('Rating V2 exception identity mismatch');
  if (!Object.hasOwn(ELEMENT_MAIN, element)) throw new Error(`Unknown DamageType ${element}`);
  if (
    String(main.AvatarID) !== characterId ||
    String(sub.AvatarID) !== characterId ||
    recommendation.avatarId !== characterId
  )
    throw new Error(`Rating V2 identity mismatch ${characterId}`);
  for (const [kind, row] of [
    ['main', main],
    ['sub', sub]
  ] as const) {
    for (const [field, value] of Object.entries(row)) {
      if (field === 'AvatarID') continue;
      if (
        !WEIGHT_CATEGORIES.includes(field as WeightCategory) ||
        (kind === 'main' && field === 'StatusResistance') ||
        (kind === 'sub' && ['DamageAddedRatio', 'SPRatio', 'HealRatio'].includes(field)) ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
      )
        throw new Error(`Invalid ${kind} preference ${characterId}:${field}`);
    }
  }
  const profile: RatingV2Profile = {
    characterId,
    element,
    status: 'ready',
    mainWeights: {},
    subWeights: {},
    effectiveSubWeights: {},
    slots: {} as RatingV2Profile['slots'],
    recommendation,
    anomalies: [],
    exceptions
  };
  const recommendedMain = new Set(
    recommendation.mainStatOptions
      .filter((option) => !agnosticSlots.has(option.slot))
      .flatMap((option) => option.propertyTypes)
  );
  const recommendedSub = new Set(recommendation.subStatPropertyTypes);
  const map = (
    key: RelicStatKey,
    row: PreferenceRow,
    flat: boolean,
    recommended: boolean
  ): PreferenceState => {
    const preference = row[STAT_CATEGORY[key]];
    return preference === undefined
      ? {
          state: 'missing',
          weight: 0,
          policy: recommended ? 'blocked-recommended-missing-v2' : 'nonrecommended-missing-zero-v2'
        }
      : { state: 'present', preference, weight: preference * (flat ? FLAT_DISCOUNT : 1) };
  };
  for (const key of Object.keys(RELIC_STAT_REGISTRY) as RelicStatKey[]) {
    const semantics = relicStatSemantics(key);
    if (semantics.mainSlots.length)
      profile.mainWeights[key] =
        STAT_CATEGORY[key] === 'DamageAddedRatio' && ELEMENT_MAIN[element] !== key
          ? { state: 'inapplicable', weight: 0 }
          : map(key, main, false, recommendedMain.has(key));
    if (semantics.canBeSubstat) {
      const mapped = map(key, sub, FLAT_KEYS.has(key), recommendedSub.has(key));
      profile.subWeights[key] = mapped;
      profile.effectiveSubWeights[key] = mapped.weight;
    }
  }
  for (const entry of exceptions.mainWeights) {
    const original = profile.mainWeights[entry.key];
    if (
      original?.state !== 'missing' ||
      !Number.isFinite(entry.preference) ||
      entry.preference < 0 ||
      entry.preference > 1 ||
      !entry.reason.trim() ||
      !relicStatSemantics(entry.key).mainSlots.includes(entry.slot) ||
      !recommendation.mainStatOptions.some(
        (option) => option.slot === entry.slot && option.propertyTypes.includes(entry.key)
      )
    )
      throw new Error(
        `Stale/conflicting Rating V2 override ${characterId}:${entry.slot}:${entry.key}`
      );
    profile.mainWeights[entry.key] = {
      state: 'override',
      preference: entry.preference,
      weight: entry.preference,
      original: { state: 'missing', category: STAT_CATEGORY[entry.key] },
      reason: entry.reason,
      slot: entry.slot
    };
  }
  const anomaly = (code: ProfileAnomaly['code'], key?: RelicStatKey, slot?: RelicSlot) =>
    profile.anomalies.push({
      characterId,
      code,
      ...(key ? { key, category: STAT_CATEGORY[key] } : {}),
      ...(slot ? { slot } : {})
    });
  for (const key of recommendation.subStatPropertyTypes) {
    if (!(key in STAT_CATEGORY) || !relicStatSemantics(key as RelicStatKey).canBeSubstat)
      throw new Error(`Illegal recommended substat ${characterId}:${key}`);
    if (profile.subWeights[key as RelicStatKey]?.state === 'missing')
      anomaly('RECOMMENDED_WEIGHT_MISSING', key as RelicStatKey);
  }
  for (const slot of RELIC_SLOTS) {
    if (slot === 'HEAD' || slot === 'HAND') {
      profile.slots[slot] = { mode: 'fixed', maximum: null };
      continue;
    }
    const agnostic = agnosticSlots.get(slot);
    profile.slots[slot] = agnostic
      ? {
          mode: 'explicit-agnostic',
          maximum: null,
          reason: agnostic.reason
        }
      : {
          mode: 'continuous',
          maximum: Math.max(
            0,
            ...Object.entries(profile.mainWeights)
              .filter(
                ([key, state]) =>
                  relicStatSemantics(key as RelicStatKey).mainSlots.includes(slot) &&
                  (state.state === 'present' || state.state === 'override')
              )
              .map(([, state]) => state.weight)
          )
        };
    const options = recommendation.mainStatOptions.find((option) => option.slot === slot);
    if (!options) throw new Error(`Missing main recommendations ${characterId}:${slot}`);
    for (const key of options.propertyTypes) {
      if (
        !(key in STAT_CATEGORY) ||
        !relicStatSemantics(key as RelicStatKey).mainSlots.includes(slot)
      )
        throw new Error(`Illegal recommended main ${characterId}:${slot}:${key}`);
      if (agnostic) continue;
      const state = profile.mainWeights[key as RelicStatKey]!;
      if (state.state === 'missing')
        anomaly('RECOMMENDED_WEIGHT_MISSING', key as RelicStatKey, slot);
      if (state.state === 'inapplicable')
        anomaly('RECOMMENDED_MAIN_INAPPLICABLE', key as RelicStatKey, slot);
    }
    if (!agnostic && !(profile.slots[slot].maximum! > 0))
      anomaly('NO_POSITIVE_MAIN_WEIGHT', undefined, slot);
  }
  if (profile.anomalies.length) profile.status = 'needs-review';
  return profile;
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, ordered(item)])
    );
  return value;
}
/** Independently reconstruct the mapping; a digest alone is not a validity check. */
export function validateRatingV2Profile(
  profile: RatingV2Profile,
  exceptions = profile.exceptions
): void {
  if (!/^[1-9]\d*$/.test(profile.characterId))
    throw new Error('Invalid Rating V2 character identity');
  const rows: { main: PreferenceRow; sub: PreferenceRow } = {
    main: { AvatarID: Number(profile.characterId) },
    sub: { AvatarID: Number(profile.characterId) }
  };
  for (const [kind, weights] of [
    ['main', profile.mainWeights],
    ['sub', profile.subWeights]
  ] as const) {
    if (!weights || typeof weights !== 'object')
      throw new Error('Invalid Rating V2 mapped weights');
    for (const [key, state] of Object.entries(weights)) {
      if (!Object.hasOwn(STAT_CATEGORY, key) || !state)
        throw new Error('Unknown Rating V2 mapped stat');
      if (state.state === 'present') {
        const category = STAT_CATEGORY[key as RelicStatKey];
        const previous = rows[kind][category];
        if (previous !== undefined && previous !== state.preference)
          throw new Error('Conflicting Rating V2 category preferences');
        rows[kind][category] = state.preference;
      }
    }
  }
  const expected = deriveRatingV2Profile({
    characterId: profile.characterId,
    element: profile.element,
    main: rows.main,
    sub: rows.sub,
    recommendation: profile.recommendation,
    exceptions
  });
  if (JSON.stringify(ordered(profile)) !== JSON.stringify(ordered(expected)))
    throw new Error(`Invalid Rating V2 mapping/normalization ${profile.characterId}`);
}
