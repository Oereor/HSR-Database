import type { CharacterRelicScoreProfile } from '../profile-types.js';
import type { RelicStatKey } from '../stat-registry.js';
import type { GeneratedNaturalRelic } from './generate-natural-relic.js';
import type { CompiledProbabilityModel } from './probability-model.js';

export type CandidateLens = 'A' | 'B' | 'C';

export type CandidateSelection =
  | { status: 'selected'; utility: number; mainSuitable: boolean }
  | { status: 'noEligibleCandidate' };

export function rawSubUtility(
  relic: GeneratedNaturalRelic,
  profile: CharacterRelicScoreProfile,
  model: CompiledProbabilityModel
): number {
  return relic.substats.reduce(
    (total, sub) =>
      total +
      (sub.value / model.subByKey[sub.key]!.highRoll) * (profile.substatWeights[sub.key] ?? 0),
    0
  );
}

export function selectCandidate(
  pieces: readonly GeneratedNaturalRelic[],
  lens: CandidateLens,
  recommendedMains: ReadonlySet<RelicStatKey>,
  utility: (piece: GeneratedNaturalRelic) => number
): CandidateSelection {
  if (!pieces.length) throw new Error('[relic-score/farming] empty experiment');
  const candidates = lens === 'A' ? pieces.slice(0, 1) : pieces;
  let best: CandidateSelection = { status: 'noEligibleCandidate' };
  for (const piece of candidates) {
    const mainSuitable = recommendedMains.has(piece.mainStat.key);
    if (lens === 'C' && !mainSuitable) continue;
    const value = utility(piece);
    if (!Number.isFinite(value)) throw new Error('[relic-score/farming] nonfinite utility');
    if (best.status === 'noEligibleCandidate' || value > best.utility)
      best = { status: 'selected', utility: value, mainSuitable };
  }
  return best;
}

export interface SampleSummary {
  sampleCount: number;
  noEligibleCount: number;
  noEligibleRate: number;
  mean: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  mainSuitableRate: number | null;
}

export function sortedSelectedValues(samples: readonly CandidateSelection[]): number[] {
  return samples
    .filter(
      (sample): sample is Extract<CandidateSelection, { status: 'selected' }> =>
        sample.status === 'selected'
    )
    .map((sample) => sample.utility)
    .sort((left, right) => left - right);
}

export function empiricalQuantile(sorted: readonly number[], probability: number): number {
  if (!sorted.length || !Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new Error('[relic-score/farming] invalid empirical quantile input');
  const position = probability * (sorted.length - 1);
  const left = Math.floor(position);
  const right = Math.min(left + 1, sorted.length - 1);
  return sorted[left] + (sorted[right] - sorted[left]) * (position - left);
}

export function summarizeSelections(samples: readonly CandidateSelection[]): SampleSummary {
  if (!samples.length) throw new Error('[relic-score/farming] empty samples');
  const values = sortedSelectedValues(samples);
  const selected = samples.filter((sample) => sample.status === 'selected');
  const percentile = (p: number): number | null =>
    values.length ? empiricalQuantile(values, p) : null;
  return {
    sampleCount: samples.length,
    noEligibleCount: samples.length - values.length,
    noEligibleRate: (samples.length - values.length) / samples.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    p25: percentile(0.25),
    p50: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
    mainSuitableRate: selected.length
      ? selected.filter((sample) => sample.status === 'selected' && sample.mainSuitable).length /
        selected.length
      : null
  };
}
