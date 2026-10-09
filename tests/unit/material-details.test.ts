import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createTextResolver } from '../../scripts/data/localization';
import { projectMaterials, projectMaterialDetails } from '../../scripts/data/projection/material';
import type { MaterialDomain } from '../../scripts/data/domain/training';
import { parseTextHash } from '../../src/lib/domain/types';
import type { MaterialCatalog, MaterialDetailCatalog } from '../../src/lib/domain/training/types';
import {
  assertMaterialDetailCatalog,
  validateMaterialDetails
} from '../../src/lib/domain/training/validation';
import { createTrainingLoader } from '../../src/lib/data/training';
import { rarityFromCode } from '../../src/lib/domain/constants';
import { getRarityColor } from '../../src/lib/domain/rarity';
import RarityStars from '../../src/lib/components/shared/RarityStars.svelte';
import ItemDetailModal from '../../src/lib/components/training/ItemDetailModal.svelte';

const source = (hash: string) => ({
  kind: 'direct' as const,
  ref: { kind: 'hash' as const, hash: parseTextHash(hash)! }
});
const material: MaterialDomain = {
  id: '2',
  mainType: 'Virtual',
  subType: 'Virtual',
  rarity: 'NotNormal',
  iconKey: '2',
  nameSource: source('18446744073709551615'),
  descriptionSource: source('18446744073709551614'),
  backgroundDescriptionSource: source('18446744073709551613')
};
const catalog = (locale: 'zh-CN' | 'en'): MaterialCatalog => ({
  schemaVersion: 1,
  locale,
  materials: [
    {
      id: '2',
      mainType: 'Virtual',
      subType: 'Virtual',
      rarity: 'NotNormal',
      iconKey: '2',
      name: 'fixture name'
    }
  ]
});
const details = (locale: 'zh-CN' | 'en'): MaterialDetailCatalog => ({
  schemaVersion: 1,
  locale,
  materials: [{ id: '2', description: `fixture ${locale}`, backgroundDescription: 'background' }]
});

describe('material detail metadata and presentation', () => {
  it.each(['zh-CN', 'en'] as const)(
    'projects lossless %s texts without leaking sources or descriptions into the catalog',
    async (locale: 'zh-CN' | 'en') => {
      const prefix = locale === 'en' ? 'fixture' : '合成文本';
      const resolver = await createTextResolver(
        { locale, textMapCode: locale === 'en' ? 'EN' : 'CHS' },
        {
          '18446744073709551615': `${prefix} name`,
          '18446744073709551614': `${prefix} <unbreak>1000</unbreak> <color=#f29e38ff>value</color>`,
          '18446744073709551613': `${prefix}\\n\\n<i>quote</i> {NICKNAME}`
        }
      );
      const base = projectMaterials([material], locale, resolver);
      const detail = projectMaterialDetails([material], locale, resolver);
      expect(Object.keys(base.materials[0]).sort()).toEqual([
        'iconKey',
        'id',
        'mainType',
        'name',
        'rarity',
        'subType'
      ]);
      expect(detail.materials[0]).toEqual({
        id: '2',
        description: `${prefix} <unbreak>1000</unbreak> <color=#f29e38ff>value</color>`,
        backgroundDescription: `${prefix}\n\n<i>quote</i> {NICKNAME}`
      });
      validateMaterialDetails(detail, base);
      const html = render(ItemDetailModal, {
        props: {
          material: base.materials[0],
          detail: detail.materials[0],
          locale,
          state: 'ready',
          onRequestClose: () => undefined,
          onClosed: () => undefined,
          onRetry: () => undefined
        }
      }).body;
      expect(html).toContain('<em>quote</em>');
      expect(html).toContain('{NICKNAME}');
      expect(html).toContain('data-game-color="#f29e38ff"');
      expect(html).not.toContain('role="status"');
    }
  );

  it('omits absent, unresolved, empty and whitespace-only optional fields without locale fallback', async () => {
    const resolver = await createTextResolver(
      { locale: 'en', textMapCode: 'EN' },
      {
        '18446744073709551614': '   ',
        '18446744073709551613': ''
      }
    );
    expect(
      projectMaterialDetails(
        [
          material,
          {
            ...material,
            id: '3',
            descriptionSource: undefined,
            backgroundDescriptionSource: source('42')
          }
        ],
        'en',
        resolver
      ).materials
    ).toEqual([{ id: '2' }, { id: '3' }]);
  });

  it('rejects invalid versions, locales, fields, duplicate IDs and incomplete inventories', () => {
    for (const invalid of [
      { ...details('en'), schemaVersion: 2 },
      { ...details('en'), locale: 'fr' },
      { ...details('en'), materials: [{ id: '2', description: 1 }] },
      { ...details('en'), materials: [{ id: '2', backgroundDescription: ' ' }] },
      { ...details('en'), materials: [{ id: '../2' }] },
      { ...details('en'), materials: [{ id: '2' }, { id: '2' }] }
    ])
      expect(() => assertMaterialDetailCatalog(invalid)).toThrow();
    expect(() => assertMaterialDetailCatalog(details('en'), 'zh-CN')).toThrow();
    for (const materials of [[], [{ id: '3' }], [{ id: '2' }, { id: '3' }]])
      expect(() =>
        validateMaterialDetails({ ...details('en'), materials }, catalog('en'))
      ).toThrow();
    expect(() =>
      validateMaterialDetails({ ...details('en'), materials: [{ id: '2' }] }, catalog('en'))
    ).not.toThrow();
  });

  it.each([
    ['NotNormal', 2],
    ['Rare', 3],
    ['VeryRare', 4],
    ['SuperRare', 5]
  ] as const)('reuses shared stars and color for %s', (code: string, count: number) => {
    const rarity = rarityFromCode(code)!;
    expect(rarity).toBe(count);
    const html = render(RarityStars, { props: { rarity } }).body;
    expect(html).toContain('★'.repeat(count));
    expect(html).not.toContain('★'.repeat(count + 1));
    expect(html).toContain(getRarityColor(rarity));
  });

  it('keeps unknown rarity neutral and missing icons on the shared fallback', () => {
    const html = render(ItemDetailModal, {
      props: {
        material: {
          ...catalog('en').materials[0],
          id: '99999999',
          iconKey: '99999999',
          rarity: 'unknown'
        },
        detail: { id: '99999999' },
        locale: 'en',
        state: 'ready',
        onRequestClose: () => undefined,
        onClosed: () => undefined,
        onRetry: () => undefined
      }
    }).body;
    expect(html).toContain('data-image-fallback');
    expect(html).not.toContain('rarity-stars');
    expect(html).not.toContain('role="status"');
  });
});

describe('lazy material detail loading', () => {
  it('does not fetch on creation or catalog loading, shares requests, and isolates locales', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const locale = url.includes('/en/') ? 'en' : 'zh-CN';
      return new Response(
        JSON.stringify(url.endsWith('/materials.json') ? catalog(locale) : details(locale))
      );
    });
    const loader = createTrainingLoader(fetcher as unknown as typeof fetch);
    expect(fetcher).not.toHaveBeenCalled();
    await loader.loadMaterials('zh-CN');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [a, b] = await Promise.all([
      loader.loadMaterialDetails('zh-CN'),
      loader.loadMaterialDetails('zh-CN')
    ]);
    expect(a).toBe(b);
    await loader.loadMaterialDetails('zh-CN', catalog('zh-CN'));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await loader.loadMaterialDetails('en', catalog('en'))).toEqual(details('en'));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(() => loader.loadMaterialDetails('fr' as never)).toThrow();
  });

  it.each(['http', 'schema', 'locale', 'inventory'])(
    'evicts %s failures and permits a real retry',
    async (failure: string) => {
      const first =
        failure === 'http'
          ? new Response('', { status: 503 })
          : new Response(
              JSON.stringify(
                failure === 'schema'
                  ? { ...details('en'), schemaVersion: 2 }
                  : failure === 'locale'
                    ? details('zh-CN')
                    : { ...details('en'), materials: [] }
              )
            );
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(new Response(JSON.stringify(details('en'))));
      const loader = createTrainingLoader(fetcher as typeof fetch);
      await expect(loader.loadMaterialDetails('en', catalog('en'))).rejects.toThrow();
      await expect(loader.loadMaterialDetails('en', catalog('en'))).resolves.toEqual(details('en'));
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );
});
