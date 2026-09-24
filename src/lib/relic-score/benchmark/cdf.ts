/** Right-continuous at ties, linear between distinct knots, clamped outside endpoints. */
export function lookupDenseCdf(quantiles: readonly number[], value: number): number {
  if (quantiles.length < 2 || !Number.isFinite(value))
    throw new Error('[relic-score/benchmark] invalid CDF lookup');
  if (value < quantiles[0]) return 0;
  if (value >= quantiles[quantiles.length - 1]) return 1;
  let low = 0;
  let high = quantiles.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (quantiles[mid] <= value) low = mid + 1;
    else high = mid;
  }
  const left = low - 1;
  const fraction = (value - quantiles[left]) / (quantiles[low] - quantiles[left]);
  return (left + fraction) / (quantiles.length - 1);
}
