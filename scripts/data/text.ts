import type { DescriptionToken } from '../../src/lib/domain/types.js';
import { normalizeGameText, parseGameTextWithScaling } from '../../src/lib/domain/game-text.js';

export type DescriptionDiagnosticCode = 'invalid-param' | 'missing-param';

export interface DescriptionDiagnostic {
  code: DescriptionDiagnosticCode;
  parameterIndex: number;
  placeholder: string;
}

export interface FormattedDescription {
  description: string;
  descriptionTokens: DescriptionToken[];
  diagnostics: DescriptionDiagnostic[];
}

export interface FormattedGameMarkup {
  text: string;
  diagnostics: DescriptionDiagnostic[];
}

const placeholderPattern = /#(\d+)(?:\[(i|f\d*)\])?(%?)/g;

function stableDecimal(value: number): string {
  return Number(value.toFixed(10)).toString();
}

function formatParameter(value: number, format: string | undefined, percent: boolean): string {
  const normalized = percent ? value * 100 : value;
  if (format === 'i') return Math.round(normalized).toString();
  if (format?.startsWith('f')) {
    const digits = Number(format.slice(1) || 1);
    return normalized.toFixed(digits);
  }
  return stableDecimal(normalized);
}

function trimTokens(tokens: DescriptionToken[]): DescriptionToken[] {
  const result = tokens
    .filter((token) => token.type === 'icon' || token.value)
    .map((token) => ({ ...token }));
  if (!result.length) return result;
  const firstText = result.find((token) => token.type !== 'icon');
  const lastText = result.findLast((token) => token.type !== 'icon');
  if (firstText) firstText.value = firstText.value.trimStart();
  if (lastText) lastText.value = lastText.value.trimEnd();
  return result.filter((token) => token.type === 'icon' || token.value);
}

function interpolateTemplate(
  source: string,
  params: readonly number[] = [],
  scalingParamIndexes: ReadonlySet<number> = new Set()
): { text: string; diagnostics: DescriptionDiagnostic[] } {
  const diagnostics: DescriptionDiagnostic[] = [];
  let result = '';
  let cursor = 0;

  for (const match of source.matchAll(placeholderPattern)) {
    const placeholder = match[0];
    const start = match.index;
    result += source.slice(cursor, start);

    const parameterIndex = Number(match[1]) - 1;
    const value = params[parameterIndex];
    if (value === undefined) {
      diagnostics.push({ code: 'missing-param', parameterIndex, placeholder });
      result += placeholder;
    } else if (!Number.isFinite(value)) {
      diagnostics.push({ code: 'invalid-param', parameterIndex, placeholder });
      result += placeholder;
    } else {
      const rendered = `${formatParameter(value, match[2], Boolean(match[3]))}${match[3]}`;
      result += scalingParamIndexes.has(parameterIndex)
        ? `<scaling-value>${rendered}</scaling-value>`
        : rendered;
    }
    cursor = start + placeholder.length;
  }
  result += source.slice(cursor);
  return { text: result, diagnostics };
}

function formatTemplate(
  source: string,
  params: readonly number[] = [],
  scalingParamIndexes: ReadonlySet<number> = new Set()
): FormattedDescription {
  const interpolated = interpolateTemplate(source, params, scalingParamIndexes);
  const descriptionTokens = trimTokens(
    parseGameTextWithScaling(interpolated.text).map((token) => ({
      type: token.icon ? 'icon' : token.scaling ? 'scaling-value' : 'text',
      value: token.value,
      ...(token.icon ? { icon: token.icon } : {}),
      ...(token.color ? { color: token.color } : {}),
      ...(token.italic ? { italic: true } : {}),
      ...(token.underline ? { underline: true } : {}),
      ...(token.unbreak ? { unbreak: true } : {})
    }))
  );
  return {
    description: descriptionTokens
      .map((token) => token.value)
      .join('')
      .replace(/[ \t]+\n/g, '\n'),
    descriptionTokens,
    diagnostics: interpolated.diagnostics
  };
}

export function formatDescription(
  template = '',
  params: readonly number[] = [],
  scalingParamIndexes: ReadonlySet<number> = new Set()
): FormattedDescription {
  return formatTemplate(normalizeGameText(template), params, scalingParamIndexes);
}

/** Interpolates verified game parameters while preserving markup for the safe GameText renderer. */
export function formatGameMarkup(
  template = '',
  params: readonly number[] = []
): FormattedGameMarkup {
  const formatted = interpolateTemplate(normalizeGameText(template), params);
  return { text: formatted.text, diagnostics: formatted.diagnostics };
}

export function formatGameText(template = '', params: number[] = []): string {
  return formatDescription(template, params).description;
}
