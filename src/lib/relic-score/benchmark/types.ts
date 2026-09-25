import type { RelicSlot } from '../../domain/types.js';
import { RELIC_SCORE_CONFIG } from '../scoring-config.js';
import type { RelicStatKey } from '../stat-registry.js';

export const BENCHMARK_SCHEMA_VERSION = 3 as const;
export const BENCHMARK_VERSION = 'lens-b-main-conditioned-v2' as const;
export const BENCHMARK_GENERATOR_VERSION = 'lens-b-production-main-conditioned-v2' as const;
export const BENCHMARK_SEED_CONTRACT = 'same-seed-reset-per-distribution-v1' as const;
export const BENCHMARK_MAX_REPRESENTATION_ERROR = 0.005 as const;
export const BENCHMARK_QUANTILE_POINTS = RELIC_SCORE_CONFIG.benchmark.quantilePoints;
export const BENCHMARK_SELECTION_MODE = 'best-base-raw-sub-utility' as const;

export interface BenchmarkSummary {
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface BenchmarkDistribution {
  identityDigest: string;
  summary: BenchmarkSummary;
  quantiles: number[];
}

export interface BenchmarkMetadata {
  prototype: boolean;
  farmingModelVersion: string;
  generatorVersion: string;
  benchmarkGeneratorVersion: string;
  prngVersion: string;
  seed: number;
  seedContract: typeof BENCHMARK_SEED_CONTRACT;
  budgetN: number;
  experimentCount: number;
  selectionMode: typeof BENCHMARK_SELECTION_MODE;
  quantileRepresentationVersion: string;
  quantilePoints: typeof BENCHMARK_QUANTILE_POINTS;
  profileDigests: Record<string, string>;
  probabilityDigest: string;
  referenceDigest: string;
}

export interface BenchmarkArtifact {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  benchmarkVersion: typeof BENCHMARK_VERSION;
  metadata: BenchmarkMetadata;
  distributions: Record<
    string,
    Partial<Record<RelicSlot, Partial<Record<RelicStatKey, BenchmarkDistribution>>>>
  >;
}
