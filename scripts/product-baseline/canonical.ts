import { createHash } from 'node:crypto';

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

export function semanticDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function withoutObjectKeys(value: unknown, ignored: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((child) => withoutObjectKeys(child, ignored));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
        ignored.has(key) ? [] : [[key, withoutObjectKeys(child, ignored)]]
      )
    );
  return value;
}

export class ContentRegistry {
  readonly values: Record<string, unknown> = {};

  add(value: unknown): string {
    const normalized = canonicalize(value);
    const key = semanticDigest(normalized);
    this.values[key] ??= normalized;
    return key;
  }
}
