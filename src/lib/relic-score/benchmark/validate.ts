import type { RelicSlot } from '../../domain/types.js';
import { QUANTILE_REPRESENTATION_VERSION } from '../farming/dense-quantile.js';
import { PRNG_VERSION } from '../farming/prng.js';
import { NATURAL_GENERATOR_VERSION } from '../farming/generate-natural-relic.js';
import { RELIC_SLOTS } from '../scoring-config.js';
import {
  BENCHMARK_QUANTILE_POINTS,
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_SELECTION_MODE,
  BENCHMARK_VERSION,
  type BenchmarkArtifact,
  type BenchmarkDistribution
} from './types.js';

export interface BenchmarkExpectedIdentity {
  budgetN: number;
  experimentCount: number;
  seed: number;
  farmingModelVersion: string;
  profileDigests: Record<string, string>;
  probabilityDigest: string;
  referenceDigest: string;
  /** Expected Lens-B digest for each requested character/slot. */
  distributions: Record<string, Partial<Record<RelicSlot, string>>>;
  requireCompleteCoverage?: boolean;
  allowPrototype?: boolean;
}

function finite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}
function positiveInt(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function digest(value: string): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function validateBenchmarkDistribution(value: BenchmarkDistribution): void {
  if (
    !value ||
    !digest(value.identityDigest) ||
    !Array.isArray(value.quantiles) ||
    value.quantiles.length !== BENCHMARK_QUANTILE_POINTS
  )
    throw new Error('[relic-score/benchmark] distribution schema');
  if (
    value.quantiles.some(
      (point, index) =>
        !finite(point) || point < 0 || (index > 0 && point < value.quantiles[index - 1])
    )
  )
    throw new Error('[relic-score/benchmark] quantiles must be finite and monotone');
  const s = value.summary;
  const ordered = s && [s.p25, s.p50, s.p75, s.p90, s.p95, s.p99];
  if (
    !s ||
    !finite(s.mean) ||
    s.mean < 0 ||
    !ordered ||
    ordered.some(
      (point) => !finite(point) || point < value.quantiles[0] || point > value.quantiles[256]
    ) ||
    ordered.some((point, index) => index > 0 && point < ordered[index - 1])
  )
    throw new Error('[relic-score/benchmark] summary ordering');
}

/** Cheap validation only; regeneration and empirical CDF measurement are offline commands. */
export function validateBenchmarkArtifact(
  raw: BenchmarkArtifact,
  expected: BenchmarkExpectedIdentity
): void {
  const artifact = raw;
  const m = artifact?.metadata;
  if (
    artifact?.schemaVersion !== BENCHMARK_SCHEMA_VERSION ||
    artifact?.benchmarkVersion !== BENCHMARK_VERSION ||
    !m ||
    !artifact.distributions
  )
    throw new Error('[relic-score/benchmark] artifact schema');
  if (m.prototype && !expected.allowPrototype)
    throw new Error('[relic-score/benchmark] prototype artifact prohibited');
  if (
    m.selectionMode !== BENCHMARK_SELECTION_MODE ||
    m.quantilePoints !== BENCHMARK_QUANTILE_POINTS ||
    m.quantileRepresentationVersion !== QUANTILE_REPRESENTATION_VERSION ||
    m.generatorVersion !== NATURAL_GENERATOR_VERSION ||
    m.prngVersion !== PRNG_VERSION ||
    !positiveInt(m.budgetN) ||
    !positiveInt(m.experimentCount) ||
    !Number.isSafeInteger(m.seed) ||
    m.seed < 0 ||
    m.seed > 0xffffffff
  )
    throw new Error('[relic-score/benchmark] metadata contract');
  if (
    m.budgetN !== expected.budgetN ||
    m.experimentCount !== expected.experimentCount ||
    m.seed !== expected.seed ||
    m.farmingModelVersion !== expected.farmingModelVersion ||
    m.probabilityDigest !== expected.probabilityDigest ||
    m.referenceDigest !== expected.referenceDigest
  )
    throw new Error('[relic-score/benchmark] stale global identity');
  if (
    !digest(m.probabilityDigest) ||
    !digest(m.referenceDigest) ||
    Object.keys(m.profileDigests).some(
      (id) => !digest(m.profileDigests[id]) || m.profileDigests[id] !== expected.profileDigests[id]
    )
  )
    throw new Error('[relic-score/benchmark] stale profile identity');
  for (const [id, slots] of Object.entries(artifact.distributions)) {
    if (
      !expected.distributions[id] ||
      !m.profileDigests[id] ||
      (expected.requireCompleteCoverage && RELIC_SLOTS.some((slot) => !slots[slot]))
    )
      throw new Error('[relic-score/benchmark] character/slot coverage');
    for (const [slot, value] of Object.entries(slots)) {
      if (!RELIC_SLOTS.includes(slot as RelicSlot) || !value)
        throw new Error('[relic-score/benchmark] invalid slot');
      validateBenchmarkDistribution(value);
      if (value.identityDigest !== expected.distributions[id]?.[slot as RelicSlot])
        throw new Error('[relic-score/benchmark] stale distribution identity');
    }
  }
  if (
    expected.requireCompleteCoverage &&
    Object.keys(artifact.distributions).length !== Object.keys(expected.distributions).length
  )
    throw new Error('[relic-score/benchmark] character coverage');
}
