const INTEGER_QUERY = /^-?\d+$/;

export function readBoundedInitialInteger(
  searchParams: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = searchParams.get(key);
  if (raw === null || !INTEGER_QUERY.test(raw)) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
