export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  return value;
}

export function canonicalJson(value: unknown, pretty = false): string {
  return JSON.stringify(canonicalize(value), null, pretty ? 2 : undefined);
}
