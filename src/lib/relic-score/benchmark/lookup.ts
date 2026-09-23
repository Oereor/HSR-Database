import { lookupDenseCdf } from '../farming/dense-quantile.js';
import type { BenchmarkDistribution } from './types.js';

/** Lookup never synthesizes a missing distribution or loads a test fixture. */
export function lookupBenchmarkPercentile(
  distribution: BenchmarkDistribution,
  rawSubUtility: number
): number {
  return Math.min(1, Math.max(0, lookupDenseCdf(distribution.quantiles, rawSubUtility)));
}
