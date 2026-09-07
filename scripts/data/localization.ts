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

export type LocalizationStatus = LocalizationResult<unknown>['status'];

export interface LocalizationHealthEntry {
  status: LocalizationStatus;
  identifier: string;
  source: BuildTextProvenance;
  locale: Locale;
  textMapCode: TextMapCode;
  disposition?: TextDiagnosticDisposition;
  reason?: string;
}

export interface LocalizationHealthTotals {
  total: number;
  statuses: Record<LocalizationStatus, number>;
  requirements: Record<'required' | 'optional', number>;
  visibility: Record<'emitted' | 'hidden', number>;
  fallbackUse: Record<'used' | 'notUsed', number>;
  routeReachability: Record<'reachable' | 'unreachable', number>;
  unclassified: number;
  invalidProgramStateErrors: number;
}

export interface LocalizationHealthSummary extends LocalizationHealthTotals {
  entries: LocalizationHealthEntry[];
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
  recordAbsent(source: BuildTextProvenance, disposition: TextDiagnosticDisposition): void;
  getDiagnostics(): TextDiagnosticSummary;
  getLocalizationHealth(): LocalizationHealthSummary;
}

const MAX_DIAGNOSTIC_SAMPLES = 20;

/** Load a TextMap using an explicit configured upstream code. */
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
  const health: LocalizationHealthSummary = {
    total: 0,
    statuses: { available: 0, absent: 0, missing: 0, empty: 0, invalid: 0, unsupported: 0 },
    requirements: { required: 0, optional: 0 },
    visibility: { emitted: 0, hidden: 0 },
    fallbackUse: { used: 0, notUsed: 0 },
    routeReachability: { reachable: 0, unreachable: 0 },
    unclassified: 0,
    invalidProgramStateErrors: 0,
    entries: []
  };

  const recordHealth = (
    status: LocalizationStatus,
    identifier: string,
    source: BuildTextProvenance,
    disposition?: TextDiagnosticDisposition,
    reason?: string
  ): void => {
    const actualDisposition = disposition
      ? { ...disposition, fallbackUsed: status === 'available' ? false : disposition.fallbackUsed }
      : undefined;
    health.total += 1;
    health.statuses[status] += 1;
    if (!actualDisposition) health.unclassified += 1;
    else {
      health.requirements[actualDisposition.requirement] += 1;
      health.visibility[actualDisposition.visibility] += 1;
      health.fallbackUse[actualDisposition.fallbackUsed ? 'used' : 'notUsed'] += 1;
      health.routeReachability[actualDisposition.productRouteReachability] += 1;
    }
    if (status === 'invalid') health.invalidProgramStateErrors += 1;
    health.entries.push({
      status,
      identifier,
      source: { ...source },
      locale: resolverConfig.locale,
      textMapCode: resolverConfig.textMapCode,
      ...(actualDisposition ? { disposition: actualDisposition } : {}),
      ...(reason ? { reason } : {})
    });
  };

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

  const resolveInternal = (
    source: RuntimeTextSource,
    context: TextProjectionContext,
    trackHealth: boolean
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
      const result = {
        status: 'invalid' as const,
        reason: 'TextMap reference is not a valid decimal hash'
      };
      if (trackHealth)
        recordHealth(
          result.status,
          String(ref.kind === 'hash' ? ref.hash : ref.key),
          provenance,
          context.diagnosticDisposition,
          result.reason
        );
      return result;
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
      const result = { status: 'missing' as const, ref: resolvedRef };
      if (trackHealth)
        recordHealth(
          result.status,
          ref.kind === 'hash' ? hash : ref.key,
          provenance,
          context.diagnosticDisposition
        );
      return result;
    }
    if (value === '') {
      record('empty-locale-value', hash, provenance, undefined, context.diagnosticDisposition);
      const result = { status: 'empty' as const, ref: resolvedRef };
      if (trackHealth)
        recordHealth(
          result.status,
          ref.kind === 'hash' ? hash : ref.key,
          provenance,
          context.diagnosticDisposition
        );
      return result;
    }
    let rendered = value;
    if (context.gender) {
      rendered = rendered.replace(/\{F#([^{}]*)\}\{M#([^{}]*)\}/g, (_m, female, male) =>
        context.gender === 'female' ? female : male
      );
      rendered = rendered.replace(/\{M#([^{}]*)\}\{F#([^{}]*)\}/g, (_m, male, female) =>
        context.gender === 'female' ? female : male
      );
    }
    if (context.nickname !== undefined)
      rendered = rendered.replaceAll('{NICKNAME}', context.nickname);
    const result = { status: 'available' as const, value: rendered, ref: resolvedRef };
    if (trackHealth)
      recordHealth(
        result.status,
        ref.kind === 'hash' ? hash : ref.key,
        provenance,
        context.diagnosticDisposition
      );
    return result;
  };

  const resolve = (
    source: RuntimeTextSource,
    context: TextProjectionContext = {}
  ): LocalizationResult<string> => resolveInternal(source, context, true);

  const projectGameText = (
    source: RuntimeTextSource,
    context: GameTextProjectionContext = {}
  ): LocalizationResult<GameTextProjection> => {
    const provenance = sourceOf(source, context);
    const resolved = resolveInternal(source, context, false);
    const identifier =
      resolved.status !== 'absent' && 'ref' in resolved && resolved.ref
        ? resolved.ref.kind === 'hash'
          ? resolved.ref.hash
          : resolved.ref.key
        : source.ref.kind === 'hash'
          ? String(source.ref.hash)
          : source.ref.key;
    if (resolved.status !== 'available') {
      recordHealth(
        resolved.status,
        identifier,
        provenance,
        context.diagnosticDisposition,
        'reason' in resolved ? resolved.reason : undefined
      );
      return resolved;
    }
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
      recordHealth('unsupported', identifier, provenance, context.diagnosticDisposition, reason);
      return { status: 'unsupported', reason, ref: resolved.ref };
    }
    const markup = formatGameMarkup(resolved.value, paramsOf(source));
    const result = {
      status: 'available',
      ref: resolved.ref,
      value: {
        text: formatted.description,
        markup: markup.text,
        tokens: formatted.descriptionTokens,
        diagnostics: formatted.diagnostics,
        usedParameterIndexes: markup.usedParameterIndexes
      }
    } as const;
    recordHealth('available', identifier, provenance, context.diagnosticDisposition);
    return result;
  };

  return {
    locale: resolverConfig.locale,
    textMapCode: resolverConfig.textMapCode,
    resolve,
    projectGameText,
    recordAbsent: (source, disposition) => recordHealth('absent', '', source, disposition),
    getDiagnostics: () => structuredClone(diagnostics),
    getLocalizationHealth: () => structuredClone(health)
  };
}

export function localizationHealthTotals(
  summary: LocalizationHealthSummary
): LocalizationHealthTotals {
  const { entries: _entries, ...totals } = summary;
  void _entries;
  return totals;
}
