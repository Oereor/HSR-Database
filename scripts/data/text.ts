import type { DescriptionToken } from '../../src/lib/domain/types.js';
import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';

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

function appendToken(tokens: DescriptionToken[], token: DescriptionToken): void {
  if (!token.value) return;
  const previous = tokens.at(-1);
  if (token.type === 'text' && previous?.type === 'text') previous.value += token.value;
  else tokens.push(token);
}

function cleanTemplate(template: string): string {
  return gameTextToPlain(template).replace(/[ \t]+\n/g, '\n');
}

function trimTokens(tokens: DescriptionToken[]): DescriptionToken[] {
  const result = tokens.filter((token) => token.value).map((token) => ({ ...token }));
  if (!result.length) return result;
  result[0].value = result[0].value.trimStart();
  result[result.length - 1].value = result[result.length - 1].value.trimEnd();
  return result.filter((token) => token.value);
}

function formatTemplate(
  source: string,
  params: readonly number[] = [],
  scalingParamIndexes: ReadonlySet<number> = new Set()
): FormattedDescription {
  const tokens: DescriptionToken[] = [];
  const diagnostics: DescriptionDiagnostic[] = [];
  let cursor = 0;

  for (const match of source.matchAll(placeholderPattern)) {
    const placeholder = match[0];
    const start = match.index;
    appendToken(tokens, { type: 'text', value: source.slice(cursor, start) });

    const parameterIndex = Number(match[1]) - 1;
    const value = params[parameterIndex];
    if (value === undefined) {
      diagnostics.push({ code: 'missing-param', parameterIndex, placeholder });
      appendToken(tokens, { type: 'text', value: placeholder });
    } else if (!Number.isFinite(value)) {
      diagnostics.push({ code: 'invalid-param', parameterIndex, placeholder });
      appendToken(tokens, { type: 'text', value: placeholder });
    } else {
      const rendered = `${formatParameter(value, match[2], Boolean(match[3]))}${match[3]}`;
      appendToken(tokens, {
        type: scalingParamIndexes.has(parameterIndex) ? 'scaling-value' : 'text',
        value: rendered
      });
    }
    cursor = start + placeholder.length;
  }
  appendToken(tokens, { type: 'text', value: source.slice(cursor) });

  const descriptionTokens = trimTokens(tokens);
  return {
    description: descriptionTokens.map((token) => token.value).join(''),
    descriptionTokens,
    diagnostics
  };
}

export function formatDescription(
  template = '',
  params: readonly number[] = [],
  scalingParamIndexes: ReadonlySet<number> = new Set()
): FormattedDescription {
  return formatTemplate(cleanTemplate(template), params, scalingParamIndexes);
}

/** Interpolates verified game parameters while preserving markup for the safe GameText renderer. */
export function formatGameMarkup(
  template = '',
  params: readonly number[] = []
): FormattedGameMarkup {
  const formatted = formatTemplate(normalizeGameText(template), params);
  return {
    text: formatted.description,
    diagnostics: formatted.diagnostics
  };
}

export function formatGameText(template = '', params: number[] = []): string {
  return formatDescription(template, params).description;
}
