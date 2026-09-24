import type { RelicSlot } from '../../domain/types.js';
import { QUANTILE_REPRESENTATION_VERSION } from '../farming/dense-quantile.js';
import { PRNG_VERSION } from '../farming/prng.js';
import { NATURAL_GENERATOR_VERSION } from '../farming/generate-natural-relic.js';
import { RELIC_SLOTS } from '../scoring-config.js';
import {
  BENCHMARK_QUANTILE_POINTS,
  BENCHMARK_GENERATOR_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_SEED_CONTRACT,
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
    Object.keys(value).sort().join(',') !== 'identityDigest,quantiles,summary' ||
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
  if (s && Object.keys(s).sort().join(',') !== 'mean,p25,p50,p75,p90,p95,p99')
    throw new Error('[relic-score/benchmark] summary schema');
  const ordered = s && [s.p25, s.p50, s.p75, s.p90, s.p95, s.p99];
  if (
    !s ||
    !finite(s.mean) ||
    s.mean < 0 ||
    !ordered ||
    ordered.some(
      (point) =>
        !finite(point) ||
        point < value.quantiles[0] ||
        point > value.quantiles[BENCHMARK_QUANTILE_POINTS - 1]
    ) ||
    ordered.some((point, index) => index > 0 && point < ordered[index - 1]) ||
    s.mean < value.quantiles[0] ||
    s.mean > value.quantiles[BENCHMARK_QUANTILE_POINTS - 1]
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
    Object.keys(artifact).sort().join(',') !==
      'benchmarkVersion,distributions,metadata,schemaVersion' ||
    !m ||
    !artifact.distributions
  )
    throw new Error('[relic-score/benchmark] artifact schema');
  if (typeof m.prototype !== 'boolean' || (m.prototype && !expected.allowPrototype))
    throw new Error('[relic-score/benchmark] prototype artifact prohibited');
  if (
    Object.keys(m).sort().join(',') !==
      'benchmarkGeneratorVersion,budgetN,experimentCount,farmingModelVersion,generatorVersion,prngVersion,probabilityDigest,profileDigests,prototype,quantilePoints,quantileRepresentationVersion,referenceDigest,seed,seedContract,selectionMode' ||
    m.selectionMode !== BENCHMARK_SELECTION_MODE ||
    m.quantilePoints !== BENCHMARK_QUANTILE_POINTS ||
    m.quantileRepresentationVersion !== QUANTILE_REPRESENTATION_VERSION ||
    m.generatorVersion !== NATURAL_GENERATOR_VERSION ||
    m.benchmarkGeneratorVersion !== BENCHMARK_GENERATOR_VERSION ||
    m.prngVersion !== PRNG_VERSION ||
    m.seedContract !== BENCHMARK_SEED_CONTRACT ||
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
    !m.profileDigests ||
    Object.keys(m.profileDigests).sort().join(',') !==
      Object.keys(expected.profileDigests).sort().join(',') ||
    Object.keys(m.profileDigests).some(
      (id) => !digest(m.profileDigests[id]) || m.profileDigests[id] !== expected.profileDigests[id]
    )
  )
    throw new Error('[relic-score/benchmark] stale profile identity');
  if (
    Object.keys(artifact.distributions).sort().join(',') !==
    Object.keys(expected.distributions).sort().join(',')
  )
    throw new Error('[relic-score/benchmark] character coverage');
  for (const [id, slots] of Object.entries(artifact.distributions)) {
    if (
      !expected.distributions[id] ||
      !m.profileDigests[id] ||
      !slots ||
      Object.keys(slots).sort().join(',') !==
        Object.keys(expected.distributions[id]).sort().join(',') ||
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
    Object.values(artifact.distributions).reduce(
      (sum, slots) => sum + Object.keys(slots).length,
      0
    ) !==
      Object.keys(expected.distributions).length * RELIC_SLOTS.length
  )
    throw new Error('[relic-score/benchmark] distribution coverage');
}
