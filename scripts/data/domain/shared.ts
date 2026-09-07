import { parseTextHash } from '../../../src/lib/domain/types.js';
import type { NeutralTextSource } from '../../../src/lib/domain/neutral.js';
import type { DecimalString } from '../../../src/lib/domain/endgame.js';

export type Raw = Record<string, unknown>;

export function decimalString(value: unknown): string {
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object' && 'Value' in value) return decimalString(value.Value);
  return '0';
}

export function params(value: unknown): DecimalString[] {
  return (Array.isArray(value) ? value.map(decimalString) : []) as DecimalString[];
}

export function textSource(value: unknown): NeutralTextSource | undefined {
  if (value && typeof value === 'object' && 'Hash' in value) {
    const hash = parseTextHash((value as { Hash: unknown }).Hash);
    return hash ? { kind: 'direct', ref: { kind: 'hash', hash } } : undefined;
  }
  if (typeof value === 'string' && value.trim())
    return { kind: 'direct', ref: { kind: 'symbolic', key: value } };
  return undefined;
}

export function parameterized(value: unknown, rawParams: unknown): NeutralTextSource | undefined {
  const source = textSource(value);
  return source ? { kind: 'parameterized', ref: source.ref, params: params(rawParams) } : undefined;
}

export function rows(source: Record<string, unknown>, name: string): Raw[] {
  const value = source[name];
  return Array.isArray(value)
    ? value.filter((item): item is Raw => !!item && typeof item === 'object')
    : [];
}

export function byId(items: Raw[], key: string): Map<string, Raw> {
  return new Map(items.map((item) => [String(item[key]), item]));
}
