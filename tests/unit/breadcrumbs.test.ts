import { describe, expect, it } from 'vitest';
import { resolveBreadcrumbs, type BreadcrumbData } from '../../src/lib/breadcrumbs';
import type { DecimalString } from '../../src/lib/domain/endgame';
import type { Enemy } from '../../src/lib/domain/types';
import { localizedHref } from '../../src/lib/i18n/routing';
import type { Locale } from '../../src/lib/paraglide/runtime.js';

const resolve = (
  routeId: string | null,
  params = {},
  data: BreadcrumbData = {},
  locale: Locale = 'zh-CN',
  status = 200
) => resolveBreadcrumbs({ routeId, params, data, locale, status });

describe.each(['zh-CN', 'en'] as const)('route breadcrumbs (%s)', (locale) => {
  it.each(['/', '/player', '/search', '/endgame'])(
    'uses existing route labels and a non-link current item (%s)',
    (route) => {
      const items = resolve(route, {}, {}, locale);
      expect(items).toHaveLength(route === '/' ? 1 : 2);
      expect(items.at(-1)?.href).toBeUndefined();
      expect(items.every(({ label }) => label.trim())).toBe(true);
    }
  );

  it.each(['characters', 'light-cones', 'relics', 'enemies'])(
    'builds the catalog parent (%s)',
    (category) => {
      expect(resolve('/[category=category]', { category }, {}, locale)).toHaveLength(2);
    }
  );

  it.each(['characters', 'light-cones', 'relics'])(
    'uses the top-level detail identity (%s)',
    (category) => {
      const items = resolve(
        '/[category=category]/[id]',
        { category, id: 'synthetic' },
        { detail: { id: 'synthetic', name: 'Synthetic name' } },
        locale
      );
      expect(items.map(({ href }) => href)).toEqual([
        localizedHref('/', locale),
        localizedHref(`/${category}`, locale),
        undefined
      ]);
      expect(items.at(-1)?.label).toBe('Synthetic name');
    }
  );

  it('links a comparison to the matching character and previous form', () => {
    const items = resolveBreadcrumbs({
      routeId: '/characters/[id]/enhancement-comparison',
      params: { id: '123' },
      locale,
      data: { detail: { id: '123', name: 'Synthetic character' } },
      comparisonBaseForm: true
    });
    expect(items.map(({ href }) => href)).toEqual([
      localizedHref('/', locale),
      localizedHref('/characters', locale),
      localizedHref('/characters/123/?enhanced=0', locale),
      undefined
    ]);
    expect(items.at(-2)?.label).toBe('Synthetic character');
  });

  it('uses the enemy Template identity and rejects a mismatched route ID', () => {
    const unit = '1' as DecimalString;
    const detail: Pick<Enemy, 'template' | 'defaultMonsterId'> = {
      template: {
        monsterTemplateId: '123',
        name: 'Synthetic Template',
        rank: 'Elite',
        camp: { id: '1', sortId: 3, name: 'Synthetic camp' },
        baseStats: { hp: unit, attack: unit, defence: unit, criticalDamage: unit }
      },
      defaultMonsterId: '12301'
    };
    const route = '/[category=category]/[id]';
    const items = resolve(route, { category: 'enemies', id: '123' }, { detail }, locale);
    expect(items.map(({ href }) => href)).toEqual([
      localizedHref('/', locale),
      localizedHref('/enemies', locale),
      undefined
    ]);
    expect(items.at(-1)).toEqual({ label: detail.template.name });
    expect(resolve(route, { category: 'enemies', id: '12301' }, { detail }, locale)).toHaveLength(
      2
    );
  });

  it.each(['moc', 'pf', 'as', 'aa'])('uses the existing mode and period payload (%s)', (mode) => {
    const modeItems = resolve(
      '/endgame/[mode=endgameMode]',
      { mode },
      { mode: { mode, label: 'Synthetic mode' } },
      locale
    );
    expect(modeItems.at(-1)?.label).toBe('Synthetic mode');
    const group = {
      mode,
      modeLabel: 'Synthetic mode',
      period: { groupId: 123, name: 'Synthetic period' }
    };
    const items = resolve(
      '/endgame/[mode=endgameMode]/[groupId]',
      { mode, groupId: '123', encounter: 'ignored' },
      { group },
      locale
    );
    expect(items).toHaveLength(4);
    expect(items.at(-2)).toEqual({
      label: 'Synthetic mode',
      href: localizedHref(`/endgame/${mode}`, locale)
    });
    expect(items.at(-1)).toEqual({ label: 'Synthetic period' });
  });

  it('does not leak stale names or infer names from IDs', () => {
    expect(
      resolve(
        '/[category=category]/[id]',
        { category: 'characters', id: 'next' },
        { detail: { id: 'old', name: 'Stale name' } },
        locale
      )
    ).toHaveLength(2);
    expect(
      resolve(
        '/endgame/[mode=endgameMode]/[groupId]',
        { mode: 'pf', groupId: '123' },
        {
          group: {
            mode: 'moc',
            modeLabel: 'Old mode',
            period: { groupId: 123, name: 'Stale period' }
          }
        },
        locale
      )
    ).toHaveLength(2);
    const items = resolve(
      '/[category=category]/[id]',
      { category: 'characters', id: 'old' },
      { detail: { id: 'old', name: 'Stale name' } },
      locale,
      404
    );
    expect(items).toHaveLength(2);
    expect(items.some(({ label }) => label === 'Stale name')).toBe(false);
    expect(resolve(null, {}, {}, locale).at(-1)?.href).toBeUndefined();
  });
});
