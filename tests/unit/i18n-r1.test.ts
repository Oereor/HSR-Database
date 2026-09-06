import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  getLocaleConfig,
  getProductionLocale,
  LOCALE_REGISTRY
} from '../../scripts/data/locale-registry';
import { parseRelicPieceId } from '../../scripts/data/domain/relic';
import { generatedRoot } from '../../scripts/data/paths';
import type { RelicSet } from '../../src/lib/domain/types';

it('uses one explicit production locale registry and keeps English disabled', () => {
  expect(getProductionLocale()).toMatchObject({
    locale: 'zh-CN',
    textMapCode: 'CHS',
    enabled: true
  });
  expect(LOCALE_REGISTRY.en).toMatchObject({ textMapCode: 'EN', enabled: false });
  expect(() => getLocaleConfig('fr')).toThrow('Unsupported locale');
});

it('parses RelicName piece identity strictly', () => {
  expect(parseRelicPieceId('RelicName_31011')).toBe('31011');
  expect(() => parseRelicPieceId('31011')).toThrow();
  expect(() => parseRelicPieceId('RelicName_31011_extra')).toThrow();
});

it('emits unique source-backed Relic piece IDs and safe effect tokens', async () => {
  const catalog = JSON.parse(
    await readFile(path.join(generatedRoot, 'views', 'zh-CN', 'catalogs', 'relics.json'), 'utf8')
  ) as Array<{ id: string }>;
  const details = await Promise.all(
    catalog.map(
      async ({ id }) =>
        JSON.parse(
          await readFile(
            path.join(generatedRoot, 'views', 'zh-CN', 'details', 'relics', `${id}.json`),
            'utf8'
          )
        ) as RelicSet
    )
  );
  const pieces = details.flatMap((set) => set.pieces.map((piece) => piece.id));
  expect(pieces).toHaveLength(184);
  expect(new Set(pieces).size).toBe(184);
  for (const effect of details.flatMap((set) => set.effects))
    expect(effect.description).toBe(effect.descriptionTokens.map((token) => token.value).join(''));
});

it('keeps Light Cone and Relic product artifacts authoritative under the locale view root', async () => {
  await expect(
    readFile(path.join(generatedRoot, 'catalogs', 'light-cones.json'), 'utf8')
  ).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(
    readFile(path.join(generatedRoot, 'catalogs', 'relics.json'), 'utf8')
  ).rejects.toMatchObject({
    code: 'ENOENT'
  });
  await expect(
    readFile(path.join(generatedRoot, 'views', 'zh-CN', 'catalogs', 'light-cones.json'), 'utf8')
  ).resolves.toBeTruthy();
});
