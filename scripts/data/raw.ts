import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isLosslessNumber, parse } from 'lossless-json';
import { parseTextHash, type TextHash, type TextReference } from '../../src/lib/domain/types.js';

function materialize(value: unknown, key = ''): unknown {
  if (isLosslessNumber(value)) {
    const raw = value.toString();
    if (key === 'Hash') return raw;
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
