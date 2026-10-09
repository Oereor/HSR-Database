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
  let text: string;
  try {
    text = await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`Required TurnBased source file is not materialized: ${relativePath}`, {
        cause: error
      });
    throw error;
  }
  return materialize(parse(text)) as T;
}

export async function readTable<T = Record<string, unknown>>(
  root: string,
  name: string
): Promise<T[]> {
  return readRaw<T[]>(root, `ExcelOutput/${name}.json`);
}

/** Select top-level object records before strict parsing; unrelated upstream rows are not consumed. */
export async function readSelectedTable<T = Record<string, unknown>>(
  root: string,
  name: string,
  field: string,
  selectedValue: string
): Promise<T[]> {
  if (!/^[A-Za-z]\w*$/.test(field)) throw new Error('Invalid selected-table field');
  const text = await readFile(path.join(root, 'ExcelOutput', `${name}.json`), 'utf8');
  if (!text.trim().startsWith('[')) throw new Error(`${name} must be a JSON array`);
  const entries: T[] = [];
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  const matcher = new RegExp(`"${field}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`);
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') {
      if (depth === 1 && char === '{') start = index;
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      if (depth < 0) throw new Error(`${name} has invalid JSON nesting`);
      if (depth === 1 && char === '}' && start >= 0) {
        const source = text.slice(start, index + 1);
        const match = matcher.exec(source);
        if (match && JSON.parse(match[1]) === selectedValue) {
          const row = materialize(parse(source)) as Record<string, unknown>;
          if (row[field] === selectedValue) entries.push(row as T);
        }
        start = -1;
      }
    }
  }
  if (depth !== 0 || quoted) throw new Error(`${name} has incomplete JSON`);
  return entries;
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
