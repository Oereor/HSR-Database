import { visibleComparisonText } from './enhancement-comparison.js';
import { groupGameTextRuby } from './game-text.js';
import type { DescriptionToken } from './types.js';

export type DiffOperation = 'equal' | 'insert' | 'delete';

export interface DiffSegment {
  operation: DiffOperation;
  tokens: DescriptionToken[];
}

export interface EnhancementTextDiff {
  before: DiffSegment[];
  after: DiffSegment[];
}

interface Atom {
  key: string;
  tokens: DescriptionToken[];
  kind: 'plain' | 'han' | 'protected';
}

type Match = readonly [before: number, after: number];

const chineseWords = new Intl.Segmenter('zh', { granularity: 'word' });
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const pieces =
  /[+−-]?\d+(?:[,.]\d+)*(?:[%％])?|\p{Script=Latin}[\p{Script=Latin}\p{Mark}]*(?:['’-][\p{Script=Latin}\p{Mark}]+)*|\p{Script=Han}+|[^\S\r\n]+|\r\n|[\s\S]/gu;
const han = /^\p{Script=Han}+$/u;
const sentenceEnd = /^[.。!?！？\r\n]+$/u;
const minorSeparator = /^[^\S\r\n]*[,:;，、：；]?[^\S\r\n]*$/u;
const maxAlignmentCells = 160_000;

function lex(tokens: readonly DescriptionToken[], splitHan = false): Atom[] {
  const source = tokens.map(({ value }) => value).join('');
  const result: Atom[] = [];
  let index = 0;
  let offset = 0;
  const emit = (value: string, start: number, kind: Atom['kind']) => {
    const end = start + value.length;
    const slices: DescriptionToken[] = [];
    while (index < tokens.length && offset < end) {
      const token = tokens[index];
      const tokenEnd = offset + token.value.length;
      const slice = token.value.slice(Math.max(0, start - offset), end - offset);
      if (slice) slices.push({ ...token, value: slice });
      if (tokenEnd > end) break;
      index++;
      offset = tokenEnd;
    }
    result.push({ key: value, tokens: slices, kind });
  };
  for (const match of source.matchAll(pieces)) {
    const [value] = match;
    if (han.test(value)) {
      const segmenter = splitHan ? graphemes : chineseWords;
      for (const segment of segmenter.segment(value))
        emit(segment.segment, match.index + segment.index, 'han');
    } else {
      emit(value, match.index, 'plain');
    }
  }
  return result;
}

function atoms(tokens: readonly DescriptionToken[]): Atom[] {
  const result: Atom[] = [];
  let plain: DescriptionToken[] = [];
  const flush = () => {
    result.push(...lex(plain));
    plain = [];
  };
  for (const group of groupGameTextRuby(tokens)) {
    if ('ruby' in group) {
      flush();
      result.push({
        key: JSON.stringify(['ruby', visibleComparisonText(group.tokens), group.ruby.annotation]),
        tokens: group.tokens,
        kind: 'protected'
      });
    } else if (
      group.token.icon ||
      group.token.type === 'interaction' ||
      group.token.unbreak ||
      group.token.type === 'fixed-param' ||
      group.token.type === 'scaling-value'
    ) {
      flush();
      const token = group.token;
      result.push({
        key: token.icon
          ? JSON.stringify(['icon', token.icon.spriteName, token.icon.id])
          : token.interaction
            ? JSON.stringify([token.value, token.interaction])
            : token.value,
        tokens: [token],
        kind: 'protected'
      });
    } else {
      plain.push(group.token);
    }
  }
  flush();
  return result;
}

function longestMatches(before: string[], after: string[]): Match[] {
  const startLimit = Math.min(before.length, after.length);
  let start = 0;
  while (start < startLimit && before[start] === after[start]) start++;
  let leftEnd = before.length;
  let rightEnd = after.length;
  while (leftEnd > start && rightEnd > start && before[leftEnd - 1] === after[rightEnd - 1]) {
    leftEnd--;
    rightEnd--;
  }
  const matches: Match[] = Array.from({ length: start }, (_, index) => [index, index]);
  if (leftEnd > start && rightEnd > start) {
    const width = rightEnd - start + 1;
    const cells = width * (leftEnd - start + 1);
    if (cells <= maxAlignmentCells) {
      const scores = new Uint16Array(cells);
      for (let left = leftEnd - 1; left >= start; left--) {
        for (let right = rightEnd - 1; right >= start; right--) {
          const cell = (left - start) * width + right - start;
          scores[cell] =
            before[left] === after[right]
              ? scores[cell + width + 1] + 1
              : Math.max(scores[cell + width], scores[cell + 1]);
        }
      }
      let left = start;
      let right = start;
      while (left < leftEnd && right < rightEnd) {
        const cell = (left - start) * width + right - start;
        if (before[left] === after[right]) {
          matches.push([left, right]);
          left++;
          right++;
        } else if (scores[cell + width] >= scores[cell + 1]) left++;
        else right++;
      }
    }
  }
  for (let index = 0; index < before.length - leftEnd; index++)
    matches.push([leftEnd + index, rightEnd + index]);
  return matches;
}

function sentences(source: Atom[]): Atom[][] {
  const groups: Atom[][] = [];
  let current: Atom[] = [];
  for (const atom of source) {
    current.push(atom);
    if (atom.kind === 'plain' && sentenceEnd.test(atom.key)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function align<T>(
  before: T[],
  after: T[],
  matches: Match[],
  changed: (before: T[], after: T[]) => void,
  equal: (before: T, after: T) => void
): void {
  let left = 0;
  let right = 0;
  for (const [matchLeft, matchRight] of matches) {
    if (left < matchLeft || right < matchRight)
      changed(before.slice(left, matchLeft), after.slice(right, matchRight));
    equal(before[matchLeft], after[matchRight]);
    left = matchLeft + 1;
    right = matchRight + 1;
  }
  if (left < before.length || right < after.length) changed(before.slice(left), after.slice(right));
}

function usefulMatches(before: Atom[], after: Atom[]): Match[] {
  const matches = longestMatches(
    before.map(({ key }) => key),
    after.map(({ key }) => key)
  );
  return matches.filter(([left, right], index) => {
    if (before[left].kind !== 'plain' || !minorSeparator.test(before[left].key)) return true;
    const previous = matches[index - 1];
    const next = matches[index + 1];
    const touchesPrevious = previous
      ? previous[0] === left - 1 && previous[1] === right - 1
      : left === 0 && right === 0;
    const touchesNext = next
      ? next[0] === left + 1 && next[1] === right + 1
      : left === before.length - 1 && right === after.length - 1;
    return touchesPrevious || touchesNext;
  });
}

function append(result: DiffSegment[], operation: DiffOperation, tokens: DescriptionToken[]): void {
  if (!tokens.length) return;
  const last = result.at(-1);
  const segment = last?.operation === operation ? last : { operation, tokens: [] };
  if (segment !== last) result.push(segment);
  for (const token of tokens) {
    const previous = segment.tokens.at(-1);
    if (
      previous?.type === 'text' &&
      token.type === 'text' &&
      previous.ruby === token.ruby &&
      previous.color === token.color &&
      previous.italic === token.italic &&
      previous.underline === token.underline &&
      previous.unbreak === token.unbreak &&
      previous.semanticReference === token.semanticReference
    )
      previous.value += token.value;
    else segment.tokens.push({ ...token });
  }
}

export function diffEnhancementText(
  before: readonly DescriptionToken[],
  after: readonly DescriptionToken[]
): EnhancementTextDiff {
  const result: EnhancementTextDiff = { before: [], after: [] };
  const equal = (left: Atom, right: Atom) => {
    append(result.before, 'equal', left.tokens);
    append(result.after, 'equal', right.tokens);
  };
  const changed = (left: Atom[], right: Atom[]) => {
    append(
      result.before,
      'delete',
      left.flatMap(({ tokens }) => tokens)
    );
    append(
      result.after,
      'insert',
      right.flatMap(({ tokens }) => tokens)
    );
  };
  const refine = (left: Atom[], right: Atom[]) => {
    if (
      !left.length ||
      !right.length ||
      ![...left, ...right].some((atom) => atom.kind === 'han' && atom.key.length > 1)
    ) {
      changed(left, right);
      return;
    }
    const split = (source: Atom[]) =>
      source.flatMap((atom) => (atom.kind === 'han' ? lex(atom.tokens, true) : [atom]));
    const leftAtoms = split(left);
    const rightAtoms = split(right);
    align(leftAtoms, rightAtoms, usefulMatches(leftAtoms, rightAtoms), changed, equal);
  };
  const left = sentences(atoms(before));
  const right = sentences(atoms(after));
  const keys = (groups: Atom[][]) =>
    groups.map((group) => JSON.stringify(group.map(({ key }) => key)));
  align(
    left,
    right,
    longestMatches(keys(left), keys(right)),
    (leftGroups, rightGroups) => {
      const leftAtoms = leftGroups.flat();
      const rightAtoms = rightGroups.flat();
      align(leftAtoms, rightAtoms, usefulMatches(leftAtoms, rightAtoms), refine, equal);
    },
    (leftGroup, rightGroup) => leftGroup.forEach((atom, index) => equal(atom, rightGroup[index]))
  );
  return result;
}
