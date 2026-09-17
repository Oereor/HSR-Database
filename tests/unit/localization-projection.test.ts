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
