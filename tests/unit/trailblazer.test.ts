import { expect, it } from 'vitest';
import { parseDecimal } from '../../scripts/data/decimal';
import { createTextResolver } from '../../scripts/data/localization';
import {
  assertTrailblazerTextVariants,
  projectWithTrailblazerText
} from '../../scripts/data/projection/trailblazer-text';
import { parseTextHash } from '../../src/lib/domain/types';
import {
  isVisibleStaticCharacter,
  staticTrailblazerText,
  trailblazerGender,
  withTrailblazerGender
} from '../../src/lib/domain/trailblazer';
import xxhash from 'xxhash-wasm';

it('maps only explicit same-path Trailblazer pairs', () => {
  const pairs = [
    ['8001', '8002'],
    ['8003', '8004'],
    ['8005', '8006'],
    ['8007', '8008'],
    ['8009', '8010']
  ];
  for (const [male, female] of pairs) {
    expect(trailblazerGender(male)).toBe('male');
    expect(trailblazerGender(female)).toBe('female');
    expect(withTrailblazerGender(male, 'female')).toBe(female);
    expect(withTrailblazerGender(female, 'male')).toBe(male);
    expect(isVisibleStaticCharacter(male, 'female')).toBe(false);
  }
  expect(withTrailblazerGender('8011', 'female')).toBe('8011');
  expect(isVisibleStaticCharacter('8011', 'female')).toBe(true);
});

it.each([
  ['en', 'EN', 'Stelle', 'Caelus'],
  ['zh-CN', 'CHS', '星', '穹']
] as const)(
  'projects nested text references, markup and tokens as a pair (%s)',
  async (locale, textMapCode, female, male) => {
    const hasher = await xxhash();
    const textMap = {
      '1': '<u>{TextID#seriesFixture}</u> #1[i]',
      [hasher.h64('seriesFixture', 0n).toString()]: '{F#F}{M#M}{NICKNAME}',
      '2': 'plain'
    };
    const config = { locale, textMapCode };
    const [primary, variants] = await Promise.all([
      createTextResolver(config, textMap),
      createTextResolver(config, textMap)
    ]);
    const projected = projectWithTrailblazerText(primary, variants, (resolver) => {
      const output = resolver.projectGameText({
        kind: 'parameterized',
        ref: { kind: 'hash', hash: parseTextHash('1')! },
        params: [parseDecimal('25')]
      });
      if (output.status !== 'available') throw new Error(output.status);
      return {
        skill: { description: output.value.markup, descriptionTokens: output.value.tokens }
      };
    });
    assertTrailblazerTextVariants({ ...projected }, locale);
    for (const [gender, expected] of [
      ['female', `F${female}`],
      ['male', `M${male}`]
    ] as const) {
      const { skill } = staticTrailblazerText(projected, gender);
      expect(skill.description).toBe(`<u>${expected}</u> 25`);
      expect(skill.descriptionTokens.map(({ value }) => value).join('')).toBe(`${expected} 25`);
      expect(skill.descriptionTokens.some(({ underline }) => underline)).toBe(true);
    }
    expect(projected.skill.description).not.toContain(female);
    expect(
      projectWithTrailblazerText(primary, variants, (resolver) => ({
        plain: resolver.resolve({
          kind: 'direct',
          ref: { kind: 'hash', hash: parseTextHash('2')! }
        })
      }))
    ).not.toHaveProperty('trailblazerText');
  }
);
