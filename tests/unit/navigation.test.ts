import { describe, expect, it } from 'vitest';
import {
  getNavigationItems,
  isNavigationItemActive,
  localizedNavigationItems
} from '../../src/lib/navigation';
import { canonicalHref, localizedHref, trailingSlashHref } from '../../src/lib/i18n/routing';

type NavigationId = ReturnType<typeof getNavigationItems>[number]['id'];
const zhItems = localizedNavigationItems('zh-CN');
const item = (id: NavigationId) => zhItems.find((entry) => entry.id === id)!;
const requiredRoutes = {
  overview: '/',
  player: '/player/',
  characters: '/characters/',
  'light-cones': '/light-cones/',
  relics: '/relics/',
  enemies: '/enemies/',
  endgame: '/endgame/'
} as const satisfies Partial<Record<NavigationId, string>>;

describe('全局导航配置', () => {
  it('保留必需入口、唯一 identity、locale 对应关系与 canonical href', () => {
    const enItems = localizedNavigationItems('en');
    const byLocale = { 'zh-CN': zhItems, en: enItems } as const;

    for (const items of Object.values(byLocale)) {
      expect(new Set(items.map(({ id }) => id)).size).toBe(items.length);
      expect(new Set(items.map(({ href }) => href)).size).toBe(items.length);
      expect(new Set(items.map(({ iconKey }) => iconKey)).size).toBe(items.length);
      for (const entry of items) {
        expect(entry.label.trim()).not.toBe('');
        expect(entry.href).toBe(trailingSlashHref(entry.href));
      }
    }

    expect(enItems.map(({ id }) => id).sort()).toEqual(zhItems.map(({ id }) => id).sort());
    const enById = new Map(enItems.map((entry) => [entry.id, entry]));
    for (const [id, route] of Object.entries(requiredRoutes)) {
      const zhEntry = item(id as keyof typeof requiredRoutes);
      const enEntry = enById.get(id as NavigationId);
      expect(zhEntry).toBeDefined();
      expect(enEntry).toBeDefined();
      expect(zhEntry.href).toBe(route);
      expect(enEntry?.href).toBe(localizedHref(route, 'en'));
      expect(canonicalHref(enEntry!.href)).toBe(route);
    }
  });

  it('首页精确匹配，其他一级路由覆盖详情子路由', () => {
    expect(isNavigationItemActive('/', item('overview'))).toBe(true);
    expect(isNavigationItemActive('/characters', item('overview'))).toBe(false);
    expect(isNavigationItemActive('/player/?uid=100000001', item('player'))).toBe(true);
    expect(isNavigationItemActive('/characters/1001', item('characters'))).toBe(true);
    expect(isNavigationItemActive('/characters/', item('characters'))).toBe(true);
    expect(isNavigationItemActive('/en/characters/1001/', item('characters'))).toBe(true);
    expect(isNavigationItemActive('/characters-extra/', item('characters'))).toBe(false);
    expect(isNavigationItemActive('/endgame/moc/1001', item('endgame'))).toBe(true);
    expect(isNavigationItemActive('/search', item('characters'))).toBe(false);
  });
});
