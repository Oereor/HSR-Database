import { describe, expect, it } from 'vitest';
import { isNavigationItemActive, NAVIGATION_ITEMS } from '../../src/lib/navigation';

const item = (id: (typeof NAVIGATION_ITEMS)[number]['id']) =>
  NAVIGATION_ITEMS.find((entry) => entry.id === id)!;

describe('全局导航配置', () => {
  it('集中定义固定中文名称与六个唯一图标', () => {
    expect(NAVIGATION_ITEMS.map((entry) => entry.label)).toEqual([
      '总览',
      '角色',
      '光锥',
      '遗器',
      '敌方单位',
      '高难模式'
    ]);
    expect(new Set(NAVIGATION_ITEMS.map((entry) => entry.iconKey)).size).toBe(6);
  });

  it('首页精确匹配，其他一级路由覆盖详情子路由', () => {
    expect(isNavigationItemActive('/', item('overview'))).toBe(true);
    expect(isNavigationItemActive('/characters', item('overview'))).toBe(false);
    expect(isNavigationItemActive('/characters/1001', item('characters'))).toBe(true);
    expect(isNavigationItemActive('/endgame/moc/1001', item('endgame'))).toBe(true);
    expect(isNavigationItemActive('/search', item('characters'))).toBe(false);
  });
});
