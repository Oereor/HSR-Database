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
