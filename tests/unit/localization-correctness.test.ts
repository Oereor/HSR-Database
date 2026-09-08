import { afterEach, expect, it } from 'vitest';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';
import { getEnemyRankLabel } from '../../src/lib/domain/enemy-overview';
import { localeCounterpartHref, localizedHref } from '../../src/lib/i18n/routing';
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
  expect(localeCounterpartHref(path, 'en')).toBe(`/en${path}`);
  expect(localeCounterpartHref(`/en${path}`, 'en')).toBe(`/en${path}`);
  expect(localeCounterpartHref(`/en${path}`, 'zh-CN')).toBe(path);
  expect(localeCounterpartHref(path, 'zh-CN')).toBe(path);
  expect(localizedHref('/enemies/1002015', 'en')).toBe('/en/enemies/1002015');
});
