export function parseCandidateList(input: string, name: 'n' | 'k' | 'alpha'): number[] {
  const values = input.split(',').map(Number);
  if (
    !values.length ||
    values.some(
      (value) =>
        !Number.isFinite(value) ||
        (name === 'alpha'
          ? value < 0 || value > 1
          : !Number.isSafeInteger(value) || value < 1 || (name === 'n' && value > 9))
    ) ||
    new Set(values).size !== values.length
  )
    throw new Error(`[relic-score/calibrate] invalid ${name} candidates`);
  return values;
}

export function maxKnotDrift(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) throw new Error('[relic-score/calibrate] knot lengths differ');
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])));
}

export function quantile<T>(sorted: readonly T[], p: number): T {
  if (!sorted.length || p < 0 || p > 1) throw new Error('[relic-score/calibrate] invalid quantile');
  return sorted[Math.floor(p * (sorted.length - 1))];
}
