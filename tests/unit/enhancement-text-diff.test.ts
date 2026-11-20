import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnhancementComparison } from '../../src/lib/domain/enhancement-comparison.js';
import type { DescriptionToken } from '../../src/lib/domain/types.js';
import {
  diffEnhancementText,
  type DiffSegment
} from '../../src/lib/domain/enhancement-text-diff.js';

const text = (value: string): DescriptionToken => ({ type: 'text', value });
const plain = (segments: DiffSegment[]) =>
  segments
    .flatMap(({ tokens }) => tokens)
    .map(({ value }) => value)
    .join('');
const changed = (segments: DiffSegment[]) =>
  plain(segments.filter(({ operation }) => operation !== 'equal'));
const styledCharacters = (tokens: DescriptionToken[]) =>
  tokens.flatMap((token) =>
    token.icon ? [token] : [...token.value].map((value) => ({ ...token, value }))
  );

describe('enhancement text diff', () => {
  it.each([
    ['完全相同。 Same text!', '完全相同。 Same text!'],
    ['造成相当于攻击力100%的伤害。', '造成相当于攻击力140%的伤害。'],
    ['Gain 2 stacks.', 'Gain 3 stacks. Deal damage.'],
    ['Gain 3 stacks. Deal damage.', 'Gain 3 stacks.'],
    ['首次造成 Ice DMG。\n恢复 3 点。', '首次造成 Fire DMG！\n\n恢复 6 点。'],
    ["Deals Jingliu's Ice DMG.", "Deals Jingliu's Quantum DMG."],
    ['前文，造成伤害。后文', '前文，造成大量伤害。后文']
  ])('round trips %j → %j', (before, after) => {
    const result = diffEnhancementText([text(before)], [text(after)]);
    expect(plain(result.before)).toBe(before);
    expect(plain(result.after)).toBe(after);
    expect(result.before.every(({ operation }) => operation !== 'insert')).toBe(true);
    expect(result.after.every(({ operation }) => operation !== 'delete')).toBe(true);
  });

  it('keeps whole percentages, English words, and multiple separated changes', () => {
    const result = diffEnhancementText(
      [text('造成相当于攻击力100%的伤害。 Deal Ice DMG.')],
      [text('造成相当于攻击力140%的伤害。 Deal Fire DMG.')]
    );
    expect(
      result.before.filter(({ operation }) => operation === 'delete').map((part) => plain([part]))
    ).toEqual(['100%', 'Ice']);
    expect(
      result.after.filter(({ operation }) => operation === 'insert').map((part) => plain([part]))
    ).toEqual(['140%', 'Fire']);
    expect(changed(diffEnhancementText([text('相同')], [text('相同')]).after)).toBe('');
  });

  it('preserves token styling, Ruby grouping, newline, icon and parameter identity', () => {
    const ruby = { index: 10, annotation: 'ルビ' };
    const icon: DescriptionToken = {
      type: 'icon',
      value: '',
      icon: { spriteName: 'Sample', id: 1 }
    };
    const before: DescriptionToken[] = [
      { ...text('固有'), underline: true },
      { ...text('标'), ruby },
      { ...text('记'), ruby, italic: true },
      icon,
      { type: 'fixed-param', value: '5%', unbreak: true, color: '#ffffff' },
      text('\nRepeated text.')
    ];
    const after: DescriptionToken[] = [
      { ...text('固有'), color: '#ffeeaa' },
      { ...text('标'), ruby },
      { ...text('记'), ruby, italic: true },
      { ...icon, icon: { spriteName: 'Sample', id: 2 } },
      { type: 'fixed-param', value: '10%', unbreak: true, color: '#ffffff' },
      text('\n\nRepeated text.')
    ];
    const result = diffEnhancementText(before, after);
    for (const [original, segments] of [
      [before, result.before],
      [after, result.after]
    ] as const)
      expect(styledCharacters(segments.flatMap(({ tokens }) => tokens))).toEqual(
        styledCharacters(original)
      );
    expect(changed(result.before)).toBe('5%');
    expect(changed(result.after)).toBe('10%\n');
    expect(result.after.every(({ tokens }) => tokens.length)).toBe(true);
  });

  it('uses bounded matching for large changed passages and keeps the unchanged surroundings', () => {
    const result = diffEnhancementText(
      [text(`Same start. ${'one '.repeat(500)}Same end.`)],
      [text(`Same start. ${'two '.repeat(500)}Same end.`)]
    );
    expect(plain(result.before)).toBe(`Same start. ${'one '.repeat(500)}Same end.`);
    expect(plain(result.after)).toBe(`Same start. ${'two '.repeat(500)}Same end.`);
    expect(result.after.map(({ operation }) => operation)).toEqual(['equal', 'insert', 'equal']);
  });

  it.each(['zh-CN', 'en'])('highlights actual Jingliu parameters as units in %s', (locale) => {
    const path = new URL(
      `../../src/lib/generated/views/${locale}/enhancement-comparisons/1212.json`,
      import.meta.url
    );
    const comparison = JSON.parse(readFileSync(path, 'utf8')) as EnhancementComparison;
    const basic = comparison.items.find(({ before }) => before?.id === '121201');
    const before = basic?.before?.description;
    const after = basic?.after?.description;
    expect(basic).toMatchObject({ level: 6, after: { id: '1121201' } });
    if (before?.kind !== 'available' || after?.kind !== 'available')
      throw new Error('Missing Jingliu comparison');
    const result = diffEnhancementText(before.tokens, after.tokens);
    expect(changed(result.before)).toContain('100%');
    expect(changed(result.after)).toContain('50%');
    expect(plain(result.before)).toBe(before.tokens.map(({ value }) => value).join(''));
    expect(plain(result.after)).toBe(after.tokens.map(({ value }) => value).join(''));
  });
});
