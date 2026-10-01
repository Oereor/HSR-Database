import type { RelicSlot } from '../domain/types.js';
import type { CharacterRelicScoreProfile, VariableRelicSlot } from './profile-types.js';
import type { RelicScoreRecommendation } from './recommendations.js';
import {
  isRelicStatKey,
  RELIC_STAT_REGISTRY,
  relicStatSemantics,
  type RelicStatKey
} from './stat-registry.js';

export const VARIABLE_RELIC_SLOTS: readonly VariableRelicSlot[] = [
  'BODY',
  'FOOT',
  'NECK',
  'OBJECT'
];
export type MainStatStatus = 'accepted' | 'mismatch' | 'agnostic';
export type MainStatEvidence = 'fixed' | 'upstream' | 'effective-substat' | 'explicit-override';
export interface MainStatPolicy {
  agnostic: boolean;
  accepted: RelicStatKey[];
  evidence: Partial<Record<RelicStatKey, MainStatEvidence[]>>;
}

/** Only recommendation evidence, final weights and explicit policy participate. */
export function resolveMainStatPolicy(
  slot: RelicSlot,
  recommendation: Pick<RelicScoreRecommendation, 'mainStatOptions' | 'subStatPropertyTypes'>,
  profile: Pick<CharacterRelicScoreProfile, 'substatWeights' | 'mainStatOverrides'>
): MainStatPolicy {
  const evidence: MainStatPolicy['evidence'] = {};
  const add = (key: RelicStatKey, source: MainStatEvidence) => {
    (evidence[key] ??= []).push(source);
  };
  const fixed = slot === 'HEAD' || slot === 'HAND';
  if (fixed) {
    for (const key of Object.keys(RELIC_STAT_REGISTRY) as RelicStatKey[])
      if (relicStatSemantics(key).mainSlots.includes(slot)) add(key, 'fixed');
  } else {
    for (const key of recommendation.mainStatOptions.find((option) => option.slot === slot)
      ?.propertyTypes ?? [])
      if (isRelicStatKey(key)) add(key, 'upstream');
    for (const key of recommendation.subStatPropertyTypes) {
      if (!isRelicStatKey(key) || !((profile.substatWeights[key] ?? 0) > 0)) continue;
      const stat = relicStatSemantics(key);
      if (stat.canBeSubstat && stat.mainSlots.includes(slot)) add(key, 'effective-substat');
    }
    for (const key of profile.mainStatOverrides?.addAccepted?.[slot] ?? [])
      add(key, 'explicit-override');
  }
  return {
    agnostic:
      !fixed &&
      (profile.mainStatOverrides?.agnosticSlots?.includes(slot as VariableRelicSlot) ?? false),
    accepted: (Object.keys(evidence) as RelicStatKey[]).sort(),
    evidence
  };
}

export function resolveMainStatStatus(
  policy: MainStatPolicy,
  actualMainStat: RelicStatKey
): MainStatStatus {
  return policy.agnostic
    ? 'agnostic'
    : policy.accepted.includes(actualMainStat)
      ? 'accepted'
      : 'mismatch';
}
