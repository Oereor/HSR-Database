import { gameTextToPlain } from '../domain/game-text.js';

export const SEARCH_NORMALIZATION_VERSION = 1 as const;
export const normalizeSearch = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·•・—_\-/]+/g, '');
export const normalizeSearchLabel = (value: string): string =>
  normalizeSearch(gameTextToPlain(value));

/** Explicit Unicode code-point order, independent of host locale and insertion order. */
export function compareSearchText(a: string, b: string): number {
  const left = Array.from(a, (char) => char.codePointAt(0)!);
  const right = Array.from(b, (char) => char.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

export const hasNamePlaceholder = (value: string): boolean =>
  /\{[^{}]*\}|#\d+\[[^\]]*\]/u.test(value);
