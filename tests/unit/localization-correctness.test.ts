import { afterEach, expect, it } from 'vitest';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';
import { getEnemyRankLabel } from '../../src/lib/domain/enemy-overview';
import {
  canonicalHref,
  localeCounterpartHref,
  localizedHref,
  trailingSlashHref
} from '../../src/lib/i18n/routing';
import { m } from '../../src/lib/paraglide/messages.js';
import { formatLocalizedList } from '../../src/lib/i18n/format';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

it('resolves all enemy ranks and unknown values at call time in both locales', () => {
  for (const locale of ['zh-CN', 'en'] as const) {
    overwriteGetLocale(() => locale);
    expect(
      ['Minion', 'MinionLv2', 'Elite', 'LittleBoss', 'BigBoss', 'unknown', undefined].map(
        getEnemyRankLabel
      )
    ).toEqual([
      m.enemy_rank_normal(),
      m.enemy_rank_normal(),
      m.enemy_rank_elite(),
      m.enemy_rank_boss(),
      m.enemy_rank_boss(),
      m.enemy_rank_unknown(),
      m.enemy_rank_unknown()
    ]);
    expect(m.endgame_node({ number: 2 })).toBe(locale === 'en' ? 'Node 2' : '节点 2');
    expect(m.endgame_wave({ number: 3 })).toBe(locale === 'en' ? 'Wave 3' : '波次 3');
  }
});

it('formats accessible lists with locale-aware separators', () => {
  expect(formatLocalizedList(['物理', '冰', '雷'], 'zh-CN')).toBe('物理、冰、雷');
  expect(formatLocalizedList(['Physical', 'Ice', 'Lightning'], 'en')).toBe(
    'Physical, Ice, Lightning'
  );
  expect(formatLocalizedList([], 'zh-CN')).toBe('');
});

it('preserves counterpart route, repeated query values and hash without duplicate prefixes', () => {
  const path = '/endgame/moc/1034?encounter=5312&test=a&test=b#details';
  const canonical = '/endgame/moc/1034/?encounter=5312&test=a&test=b#details';
  const english = '/en/endgame/moc/1034/?encounter=5312&test=a&test=b#details';
  expect(localeCounterpartHref(path, 'en')).toBe(english);
  expect(localeCounterpartHref(`/en${path}`, 'en')).toBe(english);
  expect(localeCounterpartHref(`/en${path}`, 'zh-CN')).toBe(canonical);
  expect(localeCounterpartHref(path, 'zh-CN')).toBe(canonical);
  expect(localizedHref('/enemies/1002015', 'en')).toBe('/en/enemies/1002015/');
});

it('normalizes page URLs idempotently while preserving roots, suffixes and non-page URLs', () => {
  expect(trailingSlashHref('/')).toBe('/');
  expect(trailingSlashHref('/characters')).toBe('/characters/');
  expect(trailingSlashHref('/characters/1304/')).toBe('/characters/1304/');
  expect(trailingSlashHref('/characters/1304?uid=168902602')).toBe(
    '/characters/1304/?uid=168902602'
  );
  expect(trailingSlashHref('/en/characters/1304?foo=1#section')).toBe(
    '/en/characters/1304/?foo=1#section'
  );
  expect(trailingSlashHref('/assets/icon.webp?size=2#preview')).toBe(
    '/assets/icon.webp?size=2#preview'
  );
  expect(trailingSlashHref('/sitemap.xml')).toBe('/sitemap.xml');
  expect(trailingSlashHref('?encounter=5312')).toBe('?encounter=5312');
  expect(trailingSlashHref('#details')).toBe('#details');
  expect(trailingSlashHref('https://example.com/characters/1304')).toBe(
    'https://example.com/characters/1304'
  );
  expect(canonicalHref('/en/characters/1304/?uid=168902602#build')).toBe(
    '/characters/1304/?uid=168902602#build'
  );
});

it('localizes roots, search results and Endgame pages without duplicate slashes', () => {
  expect(localizedHref('/', 'en')).toBe('/en/');
  expect(localeCounterpartHref('/en/', 'zh-CN')).toBe('/');
  expect(localizedHref('/search?q=March#search-results-characters', 'en')).toBe(
    '/en/search/?q=March#search-results-characters'
  );
  expect(localizedHref('/characters/1304/?uid=168902602', 'zh-CN')).toBe(
    '/characters/1304/?uid=168902602'
  );
  expect(localeCounterpartHref('/player/?uid=168902602', 'en')).toBe('/en/player/?uid=168902602');
  expect(localizedHref('/endgame/moc/1034', 'en')).toBe('/en/endgame/moc/1034/');
  expect(localeCounterpartHref('/en/endgame/moc/1034/', 'en')).toBe('/en/endgame/moc/1034/');
});

it('leaves file resources, external and same-document links unchanged in every helper', () => {
  const nonPages = [
    '/assets/app.js',
    '/assets/app.css',
    '/generated/en/search.json',
    '/assets/icon.png',
    '/assets/icon.webp?size=2#preview',
    '/assets/icon.svg',
    '/manifest.webmanifest',
    '/licenses/StarRailRes-AGPL-3.0.txt',
    '/sitemap.xml',
    'https://example.com/characters/1304',
    '//example.com/characters/1304',
    'mailto:info@example.com',
    '?encounter=5312',
    '#details'
  ];
  for (const href of nonPages) {
    expect(trailingSlashHref(href)).toBe(href);
    expect(localizedHref(href, 'en')).toBe(href);
    expect(canonicalHref(href)).toBe(href);
    expect(localeCounterpartHref(href, 'zh-CN')).toBe(href);
  }
});
