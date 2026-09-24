/** Keep numeric Player panel and relic affix values on the same display scale. */
export function formatPlayerDisplayNumber(value: number, percent: boolean): string {
  if (!percent) return String(Math.trunc(value + Math.sign(value || 1) * 1e-9));
  const truncated = Math.trunc(value * 1_000 + Math.sign(value || 1) * 1e-9) / 10;
  return `${truncated.toFixed(1)}%`;
}
