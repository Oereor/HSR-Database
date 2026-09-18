import { describe, expect, it } from 'vitest';
import {
  getNavigationItems,
  isNavigationItemActive,
  localizedNavigationItems
} from '../../src/lib/navigation';

type NavigationId = ReturnType<typeof getNavigationItems>[number]['id'];
const zhItems = localizedNavigationItems('zh-CN');
const item = (id: NavigationId) => zhItems.find((entry) => entry.id === id)!;

describe('全局导航配置', () => {
  it('为中文 locale 提供 canonical href、固定名称与六个唯一图标', () => {
    expect(zhItems.map((entry) => entry.label)).toEqual([
      '总览',
      '角色',
      '光锥',
      '遗器',
      '敌方单位',
      '高难模式'
    ]);
    expect(zhItems.map((entry) => entry.href)).toEqual([
      '/',
      '/characters/',
      '/light-cones/',
      '/relics/',
      '/enemies/',
      '/endgame/'
    ]);
    expect(new Set(zhItems.map((entry) => entry.iconKey)).size).toBe(6);
  });

  it('为英文 locale 提供英文名称与 localized href', () => {
    const enItems = localizedNavigationItems('en');
    expect(enItems.map((entry) => entry.label)).toEqual([
      'Overview',
      'Characters',
      'Light Cones',
      'Relics',
      'Enemies',
      'Endgame'
    ]);
    expect(enItems.map((entry) => entry.href)).toEqual([
      '/en/',
      '/en/characters/',
      '/en/light-cones/',
      '/en/relics/',
      '/en/enemies/',
      '/en/endgame/'
    ]);
  });

  it('首页精确匹配，其他一级路由覆盖详情子路由', () => {
    expect(isNavigationItemActive('/', item('overview'))).toBe(true);
    expect(isNavigationItemActive('/characters', item('overview'))).toBe(false);
    expect(isNavigationItemActive('/characters/1001', item('characters'))).toBe(true);
    expect(isNavigationItemActive('/characters/', item('characters'))).toBe(true);
    expect(isNavigationItemActive('/en/characters/1001/', item('characters'))).toBe(true);
    expect(isNavigationItemActive('/characters-extra/', item('characters'))).toBe(false);
    expect(isNavigationItemActive('/endgame/moc/1001', item('endgame'))).toBe(true);
    expect(isNavigationItemActive('/search', item('characters'))).toBe(false);
  });
});
