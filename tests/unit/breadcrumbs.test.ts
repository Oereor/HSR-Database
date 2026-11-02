import { describe, expect, it } from 'vitest';
import { resolveBreadcrumbs, type BreadcrumbData } from '../../src/lib/breadcrumbs';
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
    'builds catalog and detail parents (%s)',
    (category) => {
      const catalog = resolve('/[category=category]', { category }, {}, locale);
      expect(catalog).toHaveLength(2);
      const data = {
        detail: { id: 'synthetic', name: 'Synthetic name', template: { name: 'Synthetic enemy' } }
      };
      const items = resolve(
        '/[category=category]/[id]',
        { category, id: 'synthetic' },
        data,
        locale
      );
      expect(items.map(({ href }) => href)).toEqual([
        localizedHref('/', locale),
        localizedHref(`/${category}`, locale),
        undefined
      ]);
      expect(items.at(-1)?.label).toBe(
        category === 'enemies' ? 'Synthetic enemy' : 'Synthetic name'
      );
    }
  );

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
