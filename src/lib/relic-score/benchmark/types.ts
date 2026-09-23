import type { RelicSlot } from '../../domain/types.js';

export const BENCHMARK_SCHEMA_VERSION = 1 as const;
export const BENCHMARK_VERSION = 'lens-b-base-raw-v1' as const;
export const BENCHMARK_QUANTILE_POINTS = 257 as const;
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
  prngVersion: string;
  seed: number;
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
  distributions: Record<string, Partial<Record<RelicSlot, BenchmarkDistribution>>>;
}
