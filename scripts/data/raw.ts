import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { isLosslessNumber, parse } from 'lossless-json';
import { parseTextHash, type TextHash, type TextReference } from '../../src/lib/domain/types.js';

function materialize(value: unknown, key = ''): unknown {
  if (isLosslessNumber(value)) {
    const raw = value.toString();
    // Text hashes and fixed-point wrappers must cross the raw-data boundary without
    // passing through an IEEE-754 number. Consumers that need a JS number opt in via
    // hashOf()/numberOf(); exact endgame calculations consume the decimal spelling.
    if (key === 'Hash' || key === 'Value') return raw;
    const number = Number(raw);
    if (!Number.isSafeInteger(number)) return raw;
    return number;
  }
  if (Array.isArray(value)) return value.map((item) => materialize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, materialize(child, childKey)])
    );
  }
  return value;
}

export async function readRaw<T = unknown>(root: string, relativePath: string): Promise<T> {
  const text = await readFile(path.join(root, relativePath), 'utf8');
  return materialize(parse(text)) as T;
}

export async function readTable<T = Record<string, unknown>>(
  root: string,
  name: string
): Promise<T[]> {
  return readRaw<T[]>(root, `ExcelOutput/${name}.json`);
}

export interface ConfigSource<T> {
  name: string;
  rows: T[];
}

export function mergeConfigSources<T>(
  tableName: string,
  sources: ConfigSource<T>[],
  identityOf: (row: T) => string
): T[] {
  const merged: T[] = [];
  const seen = new Map<string, { source: string; row: T }>();
  for (const source of sources) {
    for (const row of source.rows) {
      const identity = identityOf(row);
      if (!identity) throw new Error(`${tableName} 的 ${source.name} 包含空 record identity`);
      const existing = seen.get(identity);
      if (!existing) {
        seen.set(identity, { source: source.name, row });
        merged.push(row);
        continue;
      }
      if (isDeepStrictEqual(existing.row, row)) continue;
      throw new Error(
        `${tableName} record ${identity} 在 ${existing.source} 与 ${source.name} 之间存在冲突`
      );
    }
  }
  return merged;
}

export const hashOf = (value: unknown): TextHash | undefined => {
  if (!value || typeof value !== 'object' || !('Hash' in value)) return undefined;
  const hash = (value as TextReference).Hash;
  return parseTextHash(hash);
};

export const numberOf = (value: unknown): number => {
  if (value && typeof value === 'object' && 'Value' in value)
    return Number((value as { Value: unknown }).Value ?? 0);
  return Number(value ?? 0);
};
