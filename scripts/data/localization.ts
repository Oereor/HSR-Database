import { readFile } from 'node:fs/promises';
import path from 'node:path';
import xxhash from 'xxhash-wasm';
import { parseTextHash, type TextHash } from '../../src/lib/domain/types.js';

export type TextMap = Record<string, string>;

export interface TextSource {
  entity: string;
  id?: string;
  field: string;
}

export type TextDiagnosticKind =
  'invalid-reference' | 'unresolved-hash' | 'unresolved-symbolic-key';

export interface TextDiagnosticSample {
  identifier: string;
  source: TextSource;
}

export type TextDiagnosticListener = (
  kind: TextDiagnosticKind,
  identifier: string,
  source: TextSource
) => void;

export type TextDiagnosticSummary = Record<
  TextDiagnosticKind,
  { count: number; samples: TextDiagnosticSample[] }
>;

export interface TextResolver {
  resolveHash(hash: TextHash, source: TextSource): string;
  resolveRef(ref: unknown, source: TextSource): string;
  resolveSymbolic(key: string, source: TextSource): string;
  getDiagnostics(): TextDiagnosticSummary;
}

const MAX_DIAGNOSTIC_SAMPLES = 20;

/** Load the sole supported Simplified Chinese localization source. */
export async function loadTextMap(root: string): Promise<TextMap> {
  return JSON.parse(await readFile(path.join(root, 'TextMap', 'TextMapCHS.json'), 'utf8'));
}

export async function createTextResolver(
  textMap: TextMap,
  onDiagnostic?: TextDiagnosticListener
): Promise<TextResolver> {
  const hasher = await xxhash();
  const diagnostics: TextDiagnosticSummary = {
    'invalid-reference': { count: 0, samples: [] },
    'unresolved-hash': { count: 0, samples: [] },
    'unresolved-symbolic-key': { count: 0, samples: [] }
  };
  const seenDiagnostics = new Set<string>();

  const record = (kind: TextDiagnosticKind, identifier: string, source: TextSource): void => {
    const key = [kind, identifier, source.entity, source.id ?? '', source.field].join('\u0000');
    if (seenDiagnostics.has(key)) return;
    seenDiagnostics.add(key);
    const diagnostic = diagnostics[kind];
    diagnostic.count += 1;
    if (diagnostic.samples.length < MAX_DIAGNOSTIC_SAMPLES)
      diagnostic.samples.push({ identifier, source: { ...source } });
    onDiagnostic?.(kind, identifier, { ...source });
  };

  const resolveHash = (hash: TextHash, source: TextSource): string => {
    if (!hash) return '';
    if (!/^\d+$/.test(hash)) {
      record('invalid-reference', hash, source);
      return '';
    }
    const value = textMap[hash];
    if (value === undefined) record('unresolved-hash', hash, source);
    return value ?? '';
  };

  const resolveRef = (ref: unknown, source: TextSource): string => {
    if (ref === undefined || ref === null || ref === '') return '';
    if (!ref || typeof ref !== 'object') {
      record('invalid-reference', String(ref), source);
      return '';
    }
    if (Object.keys(ref).length === 0) return '';
    if (!('Hash' in ref)) {
      record('invalid-reference', JSON.stringify(ref), source);
      return '';
    }
    const rawHash = (ref as { Hash: unknown }).Hash;
    if (rawHash === undefined || rawHash === null || rawHash === '') return '';
    const hash = parseTextHash(rawHash);
    if (!hash) {
      record('invalid-reference', String(rawHash), source);
      return '';
    }
    return resolveHash(hash, source);
  };

  const resolveSymbolic = (key: string, source: TextSource): string => {
    if (!key) return '';
    const hash = parseTextHash(hasher.h64(key, 0n).toString());
    if (!hash) {
      record('invalid-reference', key, source);
      return '';
    }
    const value = textMap[hash];
    if (value === undefined) record('unresolved-symbolic-key', key, source);
    return value ?? '';
  };

  return {
    resolveHash,
    resolveRef,
    resolveSymbolic,
    getDiagnostics: () => structuredClone(diagnostics)
  };
}
