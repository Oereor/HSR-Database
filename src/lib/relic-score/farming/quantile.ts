export function empiricalQuantile(sorted: readonly number[], probability: number): number {
  if (!sorted.length || !Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new Error('[relic-score/farming] invalid empirical quantile input');
  const position = probability * (sorted.length - 1);
  const left = Math.floor(position);
  const right = Math.min(left + 1, sorted.length - 1);
  return sorted[left] + (sorted[right] - sorted[left]) * (position - left);
}
