import { readFile } from 'node:fs/promises';
import path from 'node:path';
import xxhash from 'xxhash-wasm';
import { parseTextHash, type TextHash } from '../../src/lib/domain/types.js';
import type { DecimalString } from '../../src/lib/domain/endgame.js';
import { formatDescription, formatGameMarkup, type FormattedDescription } from './text.js';
import { getLocaleConfig, type Locale, type TextMapCode } from './locale-registry.js';
export type { Locale, TextMapCode } from './locale-registry.js';
export type TextMap = Record<string, string>;

export interface BuildTextProvenance {
  table?: string;
  entity: string;
  id?: string;
  field: string;
}

export type RuntimeTextRef =
  { kind: 'hash'; hash: TextHash } | { kind: 'symbolic'; key: string; hash?: TextHash };

/** Legacy build provenance name retained for existing audit helpers. */
export type TextSource = BuildTextProvenance;

export type RuntimeTextSource =
  | { kind: 'direct'; ref: RuntimeTextRef; provenance?: BuildTextProvenance }
  | {
      kind: 'parameterized';
      ref: RuntimeTextRef;
      params: readonly DecimalString[];
      provenance?: BuildTextProvenance;
    };

export interface TextProjectionContext {
  gender?: 'female' | 'male';
  nickname?: string;
  allowNicknamePlaceholder?: boolean;
  provenance?: BuildTextProvenance;
  diagnosticDisposition?: TextDiagnosticDisposition;
}

export interface GameTextProjectionContext extends TextProjectionContext {
  scalingParamIndexes?: ReadonlySet<number>;
}

export interface GameTextProjection {
  text: string;
  markup: string;
  tokens: FormattedDescription['descriptionTokens'];
  diagnostics: FormattedDescription['diagnostics'];
  usedParameterIndexes: number[];
}

export type LocalizationResult<T> =
  | { status: 'available'; value: T; ref?: RuntimeTextRef }
  | { status: 'absent' }
  | { status: 'missing'; ref: RuntimeTextRef }
  | { status: 'empty'; ref: RuntimeTextRef }
  | { status: 'invalid'; reason: string; ref?: RuntimeTextRef }
  | { status: 'unsupported'; reason: string; ref?: RuntimeTextRef };

export type TextDiagnosticKind =
  | 'invalid-reference'
  | 'unresolved-hash'
  | 'unresolved-symbolic-key'
  | 'empty-locale-value'
  | 'unsupported-template';

export interface TextDiagnosticSample {
  identifier: string;
  source: BuildTextProvenance;
  locale: Locale;
  textMapCode: TextMapCode;
  reason?: string;
  disposition?: TextDiagnosticDisposition;
}

export interface TextDiagnosticDisposition {
  requirement: 'required' | 'optional';
  visibility: 'emitted' | 'hidden';
  fallbackUsed: boolean;
  productRouteReachability: 'reachable' | 'unreachable';
}

export type TextDiagnosticSummary = Record<
  TextDiagnosticKind,
  { count: number; samples: TextDiagnosticSample[]; entries: TextDiagnosticSample[] }
>;

export type TextDiagnosticListener = (
  kind: TextDiagnosticKind,
  identifier: string,
  source: BuildTextProvenance,
  reason?: string,
  disposition?: TextDiagnosticDisposition
) => void;

export interface TextResolverConfig {
  locale: Locale;
  textMapCode: TextMapCode;
}

export interface TextResolver {
  readonly locale: Locale;
  readonly textMapCode: TextMapCode;
  resolve(source: RuntimeTextSource, context?: TextProjectionContext): LocalizationResult<string>;
  projectGameText(
    source: RuntimeTextSource,
    context?: GameTextProjectionContext
  ): LocalizationResult<GameTextProjection>;
  getDiagnostics(): TextDiagnosticSummary;
}

const MAX_DIAGNOSTIC_SAMPLES = 20;

/** Load a TextMap using an explicit upstream code. Production currently enables CHS only. */
export async function loadTextMap(
  root: string,
  textMapCode: TextMapCode = getLocaleConfig('zh-CN').textMapCode
): Promise<TextMap> {
  const file =
    textMapCode === 'CHS'
      ? path.join(root, 'TextMap', 'TextMapCHS.json')
      : path.join(root, 'TextMap', `TextMap${textMapCode}.json`);
  return JSON.parse(await readFile(file, 'utf8')) as TextMap;
}

function sourceOf(source: RuntimeTextSource, context: TextProjectionContext): BuildTextProvenance {
  return (
    context.provenance ??
    source.provenance ?? {
      entity: 'unknown',
      field: source.ref.kind === 'hash' ? 'TextHash' : 'symbolic-key'
    }
  );
}

function paramsOf(source: RuntimeTextSource): number[] {
  if (source.kind !== 'parameterized') return [];
  return source.params.map((value) => Number(value));
}

export function runtimeTextSourceFromRef(
  ref: unknown,
  provenance: BuildTextProvenance
): RuntimeTextSource | undefined {
  if (ref === undefined || ref === null || ref === '') return undefined;
  if (typeof ref === 'string' && ref.trim())
    return { kind: 'direct', ref: { kind: 'symbolic', key: ref }, provenance };
  if (!ref || typeof ref !== 'object' || !('Hash' in ref)) return undefined;
  const hash = parseTextHash((ref as { Hash: unknown }).Hash);
  return hash ? { kind: 'direct', ref: { kind: 'hash', hash }, provenance } : undefined;
}

export async function createTextResolver(
  config: TextResolverConfig,
  textMap: TextMap,
  onDiagnostic?: TextDiagnosticListener
): Promise<TextResolver> {
  const resolverConfig = config;
  const hasher = await xxhash();
  const diagnostics: TextDiagnosticSummary = {
    'invalid-reference': { count: 0, samples: [], entries: [] },
    'unresolved-hash': { count: 0, samples: [], entries: [] },
    'unresolved-symbolic-key': { count: 0, samples: [], entries: [] },
    'empty-locale-value': { count: 0, samples: [], entries: [] },
    'unsupported-template': { count: 0, samples: [], entries: [] }
  };
  const seenDiagnostics = new Set<string>();

  const record = (
    kind: TextDiagnosticKind,
    identifier: string,
    source: BuildTextProvenance,
    reason?: string,
    disposition?: TextDiagnosticDisposition
  ): void => {
    const key = [kind, identifier, source.entity, source.id ?? '', source.field, reason ?? ''].join(
      '\u0000'
    );
    if (seenDiagnostics.has(key)) return;
    seenDiagnostics.add(key);
    const diagnostic = diagnostics[kind];
    diagnostic.count += 1;
    const entry: TextDiagnosticSample = {
      identifier,
      source: { ...source },
      locale: resolverConfig.locale,
      textMapCode: resolverConfig.textMapCode,
      ...(reason ? { reason } : {}),
      ...(disposition ? { disposition: { ...disposition } } : {})
    };
    diagnostic.entries.push(entry);
    if (diagnostic.samples.length < MAX_DIAGNOSTIC_SAMPLES) diagnostic.samples.push(entry);
    onDiagnostic?.(kind, identifier, { ...source }, reason, disposition);
  };

  const resolve = (
    source: RuntimeTextSource,
    context: TextProjectionContext = {}
  ): LocalizationResult<string> => {
    const provenance = sourceOf(source, context);
    const ref = source.ref;
    const hash =
      ref.kind === 'hash'
        ? ref.hash
        : (ref.hash ?? parseTextHash(hasher.h64(ref.key, 0n).toString()));
    if (!hash) {
      record(
        'invalid-reference',
        ref.kind === 'hash' ? String(ref.hash) : ref.key,
        provenance,
        undefined,
        context.diagnosticDisposition
      );
      return { status: 'invalid', reason: 'TextMap reference is not a valid decimal hash' };
    }
    const resolvedRef: RuntimeTextRef =
      ref.kind === 'hash' ? ref : { kind: 'symbolic', key: ref.key, hash };
    const value = textMap[hash];
    if (value === undefined) {
      record(
        ref.kind === 'hash' ? 'unresolved-hash' : 'unresolved-symbolic-key',
        ref.kind === 'hash' ? hash : ref.key,
        provenance,
        undefined,
        context.diagnosticDisposition
      );
      return { status: 'missing', ref: resolvedRef };
    }
    if (value === '') {
      record('empty-locale-value', hash, provenance, undefined, context.diagnosticDisposition);
      return { status: 'empty', ref: resolvedRef };
    }
    let rendered = value;
    if (context.gender) {
      rendered = rendered.replace(/\{F#([^{}]*)\}\{M#([^{}]*)\}/g, (_m, female, male) =>
        context.gender === 'female' ? female : male
      );
    }
    if (context.nickname !== undefined)
      rendered = rendered.replaceAll('{NICKNAME}', context.nickname);
    return { status: 'available', value: rendered, ref: resolvedRef };
  };

  const projectGameText = (
    source: RuntimeTextSource,
    context: GameTextProjectionContext = {}
  ): LocalizationResult<GameTextProjection> => {
    const resolved = resolve(source, context);
    if (resolved.status !== 'available') return resolved;
    const formatted = formatDescription(
      resolved.value,
      paramsOf(source),
      context.scalingParamIndexes ?? new Set()
    );
    if (formatted.diagnostics.some(({ code }) => code === 'invalid-param')) {
      const provenance = sourceOf(source, context);
      const reason = 'GameText contains an invalid parameter';
      record(
        'unsupported-template',
        String(resolved.ref ?? ''),
        provenance,
        reason,
        context.diagnosticDisposition
      );
      return { status: 'unsupported', reason, ref: resolved.ref };
    }
    const markup = formatGameMarkup(resolved.value, paramsOf(source));
    return {
      status: 'available',
      ref: resolved.ref,
      value: {
        text: formatted.description,
        markup: markup.text,
        tokens: formatted.descriptionTokens,
        diagnostics: formatted.diagnostics,
        usedParameterIndexes: markup.usedParameterIndexes
      }
    };
  };

  return {
    locale: resolverConfig.locale,
    textMapCode: resolverConfig.textMapCode,
    resolve,
    projectGameText,
    getDiagnostics: () => structuredClone(diagnostics)
  };
}
