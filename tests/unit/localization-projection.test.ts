import { expect, it } from 'vitest';
import {
  createTextResolver,
  loadTextMap,
  type TextDiagnosticDisposition
} from '../../scripts/data/localization';
import { getLocaleConfig } from '../../scripts/data/locale-registry';
import { resolveDataRoot } from '../../scripts/data/paths';
import { parseTextHash } from '../../src/lib/domain/types';
import { parseDecimal } from '../../scripts/data/decimal';
import { gameTextToPlain, groupGameTextRuby } from '../../src/lib/domain/game-text';
import xxhash from 'xxhash-wasm';

const disposition: TextDiagnosticDisposition = {
  requirement: 'required',
  visibility: 'emitted',
  fallbackUsed: false,
  productRouteReachability: 'reachable'
};

const direct = (hash: string) =>
  ({
    kind: 'direct',
    ref: { kind: 'hash', hash: parseTextHash(hash)! },
    provenance: { entity: 'test', id: hash, field: 'text' }
  }) as const;

it('projects real English TextMap parameters, markup, icons, gender, nickname and line breaks', async () => {
  const locale = getLocaleConfig('en');
  const resolver = await createTextResolver(
    { locale: 'en', textMapCode: locale.textMapCode },
    await loadTextMap(resolveDataRoot(), locale.textMapCode)
  );
  const percent = resolver.projectGameText(
    {
      ...direct('10600056941853543782'),
      kind: 'parameterized',
      params: [parseDecimal('0.25')]
    },
    { diagnosticDisposition: disposition }
  );
  expect(percent).toMatchObject({ status: 'available' });
  if (percent.status === 'available') {
    expect(percent.value.markup).toContain('<unbreak>25%</unbreak>');
    expect(percent.value.tokens.some(({ color }) => color === '#f29e38ff')).toBe(true);
  }
  const icon = resolver.projectGameText(direct('5574399201811659921'), {
    diagnosticDisposition: disposition
  });
  expect(icon.status === 'available' && icon.value.tokens.some(({ type }) => type === 'icon')).toBe(
    true
  );
  expect(
    resolver.resolve(direct('10983142452988471988'), {
      gender: 'female',
      diagnosticDisposition: disposition
    })
  ).toMatchObject({ status: 'available', value: expect.stringContaining('gal') });
  expect(
    resolver.resolve(direct('7690244458380719962'), {
      nickname: 'Trailblazer',
      diagnosticDisposition: disposition
    })
  ).toMatchObject({ status: 'available', value: 'Trailblazer' });
  expect(
    resolver.projectGameText(
      {
        ...direct('3979944267516662684'),
        kind: 'parameterized',
        params: [parseDecimal('123'), parseDecimal('456')]
      },
      { diagnosticDisposition: disposition }
    )
  ).toMatchObject({ status: 'available', value: { markup: expect.stringContaining('\n') } });
});

it('does not consult CHS when an English TextMap entry is missing', async () => {
  const resolver = await createTextResolver({ locale: 'en', textMapCode: 'EN' }, {});
  expect(
    resolver.resolve(direct('1'), {
      diagnosticDisposition: disposition
    })
  ).toMatchObject({ status: 'missing' });
});

it.each([
  ['zh-CN', 'CHS', '开拓者'],
  ['en', 'EN', 'Trailblazer']
] as const)(
  'expands %s gender branches and nicknames with or without a character context',
  async (locale, textMapCode, nickname) => {
    const resolver = await createTextResolver(
      { locale, textMapCode },
      {
        '1': '{M#boy}{F#girl} {F#she}{M#he}{F#!}{M#?} {NICKNAME}',
        '2': '{F#{NICKNAME}}{M#guest}'
      }
    );
    expect(resolver.resolve(direct('1'))).toMatchObject({ value: `girl she! ${nickname}` });
    expect(resolver.resolve(direct('1'), { gender: 'male' })).toMatchObject({
      value: `boy he? ${nickname}`
    });
    expect(
      resolver.resolve(direct('2'), { gender: 'female', nickname: 'Traveler $&' })
    ).toMatchObject({
      value: 'Traveler $&'
    });
  }
);

it('resolves nested TextID keys through the current TextMap and records invalid references', async () => {
  const { h64 } = await xxhash();
  const hash = (key: string) => h64(key).toString();
  const resolver = await createTextResolver(
    { locale: 'en', textMapCode: 'EN' },
    {
      '1': 'Location: {TextID#FloorName_1}',
      '2': 'Location: {TextID#missing}',
      '3': 'Location: {TextID#cycle}',
      [hash('FloorName_1')]: '{TextID#District} station',
      [hash('District')]: 'North',
      [hash('cycle')]: '{TextID#cycle}'
    }
  );
  expect(resolver.resolve(direct('1'))).toMatchObject({ value: 'Location: North station' });
  expect(resolver.resolve(direct('2'))).toMatchObject({ status: 'missing' });
  expect(resolver.resolve(direct('3'))).toMatchObject({ status: 'missing' });
  expect(resolver.getDiagnostics()['unresolved-text-id'].entries).toEqual([
    expect.objectContaining({
      identifier: 'missing',
      source: { entity: 'test', id: '2', field: 'text' }
    }),
    expect.objectContaining({ identifier: 'cycle', reason: 'Cyclic TextID reference' })
  ]);
});

it('keeps Ruby style and numeric tokens together and reports unmatched markers', async () => {
  const resolver = await createTextResolver(
    { locale: 'en', textMapCode: 'EN' },
    {
      '1': '<i>{RUBY_B#A longer note}<color=#abcdef>Rank</color> #1[i]%{RUBY_E#}</i>',
      '2': 'Before {RUBY_B#Unmatched}visible base',
      '3': 'Before visible base{RUBY_E#}'
    }
  );
  const result = resolver.projectGameText(
    { ...direct('1'), kind: 'parameterized', params: [parseDecimal('0.25')] },
    { scalingParamIndexes: new Set([0]) }
  );
  expect(result.status).toBe('available');
  if (result.status !== 'available') return;
  expect(result.value.text).toBe('Rank 25%');
  expect(gameTextToPlain(result.value.markup)).toBe(result.value.text);
  expect(groupGameTextRuby(result.value.tokens)).toEqual([
    expect.objectContaining({
      ruby: expect.objectContaining({ annotation: 'A longer note' }),
      tokens: [
        expect.objectContaining({ value: 'Rank', color: '#abcdef', italic: true }),
        expect.objectContaining({ value: ' ', italic: true }),
        expect.objectContaining({ value: '25%', type: 'scaling-value', italic: true })
      ]
    })
  ]);
  for (const id of ['2', '3'])
    expect(resolver.resolve(direct(id))).toMatchObject({ value: 'Before visible base' });
  expect(
    resolver.getDiagnostics()['malformed-ruby'].entries.map(({ source }) => source.id)
  ).toEqual(['2', '3']);
});
