import type { RelicStatKey } from '../stat-registry.js';

/** The only V2 utility definition, used by runtime explanations and Monte Carlo. */
export function subUtilityTerm(actual: number, highRoll: number, weight: number): number {
  if (
    !Number.isFinite(actual) ||
    actual < 0 ||
    !Number.isFinite(highRoll) ||
    highRoll <= 0 ||
    !Number.isFinite(weight) ||
    weight < 0 ||
    weight > 1
  )
    throw new Error('Invalid Rating V2 utility input');
  return (actual / highRoll) * weight;
}
export function ratingV2RawSubUtility(
  substats: readonly { key: RelicStatKey; value: number }[],
  weights: Partial<Record<RelicStatKey, number>>,
  highRoll: (key: RelicStatKey) => number
): number {
  const result = substats.reduce(
    (sum, sub) => sum + subUtilityTerm(sub.value, highRoll(sub.key), weights[sub.key] ?? 0),
    0
  );
  if (!Number.isFinite(result)) throw new Error('Nonfinite Rating V2 utility');
  return result;
}
