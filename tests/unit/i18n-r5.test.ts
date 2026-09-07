import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createTextResolver,
  loadTextMap,
  type TextDiagnosticDisposition
} from '../../scripts/data/localization';
import { getLocaleConfig } from '../../scripts/data/locale-registry';
import { generatedRoot, resolveDataRoot, staticGeneratedRoot } from '../../scripts/data/paths';
import { readDataManifest } from '../../scripts/data/generated-artifacts';
import type { GlobalSearchIndex } from '../../src/lib/domain/search-index';
import { parseTextHash } from '../../src/lib/domain/types';
import { parseDecimal } from '../../scripts/data/decimal';

const disposition: TextDiagnosticDisposition = {
  requirement: 'required',
  visibility: 'emitted',
  fallbackUsed: false,
  productRouteReachability: 'reachable'
};

describe('R5 English data projection', () => {
  it('publishes complete dual-locale metadata while keeping zh-CN public', async () => {
    const manifest = await readDataManifest();
    expect(manifest.schemaVersion).toBe(43);
    expect(manifest.publicLocales).toEqual(['zh-CN', 'en']);
    expect(manifest.generatedLocales).toEqual(['zh-CN', 'en']);
    expect(manifest.publicLocale).toBe('zh-CN');
    expect(manifest.locales.en.counts).toEqual(manifest.locales['zh-CN'].counts);
    expect(manifest.locales.en.localization).toMatchObject({
      unclassified: 0,
      invalidProgramStateErrors: 0
    });
    expect(manifest.locales.en.search).toMatchObject({
      documents: 1144,
      endgameTargets: 190,
      occurrenceReferences: 8167,
      occurrenceShards: 190
    });
  });

  it('uses real TextMapEN for parameters, markup, icons, gender, nickname and line breaks', async () => {
    const root = resolveDataRoot();
    const locale = getLocaleConfig('en');
    const resolver = await createTextResolver(
      { locale: 'en', textMapCode: locale.textMapCode },
      await loadTextMap(root, locale.textMapCode)
    );
    const direct = (hash: string) =>
      ({
        kind: 'direct',
        ref: { kind: 'hash', hash: parseTextHash(hash)! },
        provenance: { entity: 'test', id: hash, field: 'text' }
      }) as const;
    const percent = resolver.projectGameText(
      {
        ...direct('10600056941853543782'),
        kind: 'parameterized',
        params: [parseDecimal('0.25')]
      },
      { diagnosticDisposition: disposition }
    );
    expect(percent.status).toBe('available');
    if (percent.status === 'available') {
      expect(percent.value.markup).toContain('<unbreak>25%</unbreak>');
      expect(percent.value.tokens.some(({ color }) => color === '#f29e38ff')).toBe(true);
    }
    const icon = resolver.projectGameText(direct('5574399201811659921'), {
      diagnosticDisposition: disposition
    });
    expect(
      icon.status === 'available' && icon.value.tokens.some(({ type }) => type === 'icon')
    ).toBe(true);
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

  it('never consults CHS when an English TextMap entry is missing', async () => {
    const en = await createTextResolver({ locale: 'en', textMapCode: 'EN' }, {});
    const result = en.resolve(
      {
        kind: 'direct',
        ref: { kind: 'hash', hash: parseTextHash('1')! },
        provenance: { entity: 'test', id: '1', field: 'name' }
      },
      { diagnosticDisposition: disposition }
    );
    expect(result).toMatchObject({ status: 'missing' });
  });

  it('emits English Search and deterministic occurrence shards without player aliases', async () => {
    const search = JSON.parse(
      await readFile(path.join(staticGeneratedRoot, 'en', 'search.json'), 'utf8')
    ) as GlobalSearchIndex;
    expect(search.locale).toBe('en');
    expect(search.documents.every(({ playerAliases }) => playerAliases.length === 0)).toBe(true);
    const shardFiles = await readdir(
      path.join(generatedRoot, 'views', 'en', 'endgame-occurrences')
    );
    expect(shardFiles).toHaveLength(search.endgameTargets.length);
    const target = search.endgameTargets[0];
    const shard = JSON.parse(
      await readFile(
        path.join(generatedRoot, 'views', 'en', 'endgame-occurrences', target.id),
        'utf8'
      )
    );
    expect(shard).toMatchObject({
      schemaVersion: 2,
      locale: 'en',
      target: { kind: 'endgame', id: target.id }
    });
    expect(Object.keys(shard.occurrences)).toHaveLength(target.occurrences.length);
    await expect(
      readFile(path.join(generatedRoot, 'views', 'en', 'homepage.json'))
    ).resolves.toBeTruthy();
  });
});
