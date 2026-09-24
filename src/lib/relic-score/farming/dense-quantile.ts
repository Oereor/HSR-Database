import { empiricalQuantile } from './prototype.js';
import { lookupDenseCdf } from '../benchmark/cdf.js';

export { QUANTILE_REPRESENTATION_VERSION } from '../benchmark/versions.js';
export { lookupDenseCdf } from '../benchmark/cdf.js';

export function encodeDenseQuantiles(sorted: readonly number[], pointCount: 257 | 513): number[] {
  if (
    !sorted.length ||
    sorted.some(
      (value, index) => !Number.isFinite(value) || (index > 0 && value < sorted[index - 1])
    )
  )
    throw new Error('[relic-score/farming] sorted finite samples required');
  return Array.from({ length: pointCount }, (_, index) =>
    empiricalQuantile(sorted, index / (pointCount - 1))
  );
}

function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function exactEmpiricalCdf(sorted: readonly number[], value: number): number {
  if (!sorted.length) throw new Error('[relic-score/farming] empty CDF sample');
  return upperBound(sorted, value) / sorted.length;
}

export interface QuantileError {
  maxAbsoluteCdfError: number;
  meanAbsoluteCdfError: number;
  maxPercentilePointError: number;
  maxSampleRankError: number;
  queryCount: number;
}

export function measureQuantileError(
  sorted: readonly number[],
  quantiles: readonly number[]
): QuantileError {
  const queries: number[] = [];
  for (let index = 0; index < sorted.length; index++) {
    if (index > 0 && sorted[index] === sorted[index - 1]) continue;
    queries.push(sorted[index]);
    if (index > 0 && sorted[index] > sorted[index - 1])
      queries.push(sorted[index - 1] + (sorted[index] - sorted[index - 1]) / 2);
  }
  let maxAbsoluteCdfError = 0;
  let sumAbsoluteCdfError = 0;
  for (const query of queries) {
    const error = Math.abs(lookupDenseCdf(quantiles, query) - exactEmpiricalCdf(sorted, query));
    maxAbsoluteCdfError = Math.max(maxAbsoluteCdfError, error);
    sumAbsoluteCdfError += error;
  }
  return {
    maxAbsoluteCdfError,
    meanAbsoluteCdfError: sumAbsoluteCdfError / queries.length,
    maxPercentilePointError: maxAbsoluteCdfError * 100,
    maxSampleRankError: maxAbsoluteCdfError * sorted.length,
    queryCount: queries.length
  };
}
