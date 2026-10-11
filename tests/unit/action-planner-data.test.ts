import { describe, expect, it } from 'vitest';
import { loadPlannerData } from '../../src/lib/server/action-planner';

describe('action planner projection', () => {
  it('projects real locale-specific identities with identical numeric data and a small closed shape', async () => {
    const [zh, en] = await Promise.all([loadPlannerData('zh-CN'), loadPlannerData('en')]);
    expect(zh.characters.length).toBeGreaterThan(0);
    expect(
      zh.characters.map(({ id, baseSpeed, avatarId }) => ({ id, baseSpeed, avatarId }))
    ).toEqual(en.characters.map(({ id, baseSpeed, avatarId }) => ({ id, baseSpeed, avatarId })));
    for (const character of [...zh.characters, ...en.characters]) {
      expect(Object.keys(character).sort()).toEqual(['avatarId', 'baseSpeed', 'id', 'name']);
      expect(character.baseSpeed).toBeGreaterThan(0);
    }
    expect(zh.presets).not.toEqual(en.presets);
  });
  it('keeps malformed and unavailable details selectable without invented speed or cross-locale fallback', async () => {
    const requested: string[] = [];
    const result = await loadPlannerData('en', {
      catalog: async (locale, category) => {
        requested.push(locale);
        return category === 'characters'
          ? [
              { id: 'a', name: 'synthetic a' },
              { id: 'b', name: 'synthetic b' },
              { id: 'c', name: 'synthetic c' }
            ]
          : [];
      },
      detail: async (locale, _category, id) => {
        requested.push(locale);
        if (id === 'a') throw new Error('unreadable');
        return id === 'b' ? { baseStats: { fixed: { speed: -1 } }, profiles: { huge: true } } : {};
      }
    });
    expect(result.characters.map((entry) => Object.keys(entry).sort())).toEqual(
      Array(3).fill(['avatarId', 'id', 'name'])
    );
    expect(requested.every((locale) => locale === 'en')).toBe(true);
    expect(Object.values(result.presets).every((value) => value === undefined)).toBe(true);
  });
});
