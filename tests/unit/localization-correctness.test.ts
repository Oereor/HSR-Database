import { afterEach, expect, it } from 'vitest';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';
import { getEnemyRankLabel } from '../../src/lib/domain/enemy-overview';
import { localeCounterpartHref, localizedHref } from '../../src/lib/i18n/routing';
import { m } from '../../src/lib/paraglide/messages.js';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

it('resolves all enemy ranks and unknown values at call time in both locales', () => {
  for (const locale of ['zh-CN', 'en'] as const) {
    overwriteGetLocale(() => locale);
    expect(
      ['Minion', 'MinionLv2', 'Elite', 'LittleBoss', 'BigBoss', 'unknown', undefined].map(
        getEnemyRankLabel
      )
    ).toEqual(
      locale === 'en'
        ? [
            'Normal Enemy',
            'Normal Enemy',
            'Elite Enemy',
            'Boss Enemy',
            'Boss Enemy',
            'Enemy',
            'Enemy'
          ]
        : ['普通敌人', '普通敌人', '精英敌人', '首领敌人', '首领敌人', '敌方单位', '敌方单位']
    );
    expect(m.endgame_node({ number: 2 })).toBe(locale === 'en' ? 'Node 2' : '节点 2');
    expect(m.endgame_wave({ number: 3 })).toBe(locale === 'en' ? 'Wave 3' : '波次 3');
  }
});

it('preserves counterpart route, repeated query values and hash without duplicate prefixes', () => {
  const path = '/endgame/moc/1034?encounter=5312&test=a&test=b#details';
  expect(localeCounterpartHref(path, 'en')).toBe(`/en${path}`);
  expect(localeCounterpartHref(`/en${path}`, 'en')).toBe(`/en${path}`);
  expect(localeCounterpartHref(`/en${path}`, 'zh-CN')).toBe(path);
  expect(localeCounterpartHref(path, 'zh-CN')).toBe(path);
  expect(localizedHref('/enemies/1002015', 'en')).toBe('/en/enemies/1002015');
});
