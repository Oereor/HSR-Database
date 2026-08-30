import { describe, expect, it } from 'vitest';
import {
  hasLightConeFilters,
  matchesLightConeFilters,
  readLightConeFilterState,
  writeLightConeFilterState
} from '../../src/lib/domain/light-cone-filters';

const lightCone = {
  id: '23000',
  name: '银河铁道之夜',
  path: 'Mage',
  rarity: 5
};

describe('光锥多选筛选', () => {
  it('读取重复参数并兼容单值参数', () => {
    const state = readLightConeFilterState(
      new URLSearchParams('path=Mage&path=Warlock&rarity=5&rarity=4')
    );
    expect([...state.paths]).toEqual(['Mage', 'Warlock']);
    expect([...state.rarities]).toEqual(['5', '4']);
  });

  it('同类 OR、跨类 AND，空集合代表全部', () => {
    expect(
      matchesLightConeFilters(lightCone, {
        paths: new Set(['Mage', 'Warlock']),
        rarities: new Set(['4', '5'])
      })
    ).toBe(true);
    expect(
      matchesLightConeFilters(lightCone, {
        paths: new Set(['Mage']),
        rarities: new Set(['4'])
      })
    ).toBe(false);
    expect(matchesLightConeFilters(lightCone, { paths: new Set(), rarities: new Set() })).toBe(
      true
    );
  });

  it('序列化筛选时保留 query/sort 并清除 page', () => {
    const next = writeLightConeFilterState(new URLSearchParams('q=银河&sort=name&page=2'), {
      paths: new Set(['Mage', 'Warlock']),
      rarities: new Set(['5'])
    });
    expect(next.getAll('path')).toEqual(['Mage', 'Warlock']);
    expect(next.getAll('rarity')).toEqual(['5']);
    expect(next.get('q')).toBe('银河');
    expect(next.get('sort')).toBe('name');
    expect(next.has('page')).toBe(false);
  });

  it('可判断是否存在 active filters', () => {
    expect(hasLightConeFilters({ paths: new Set(), rarities: new Set() })).toBe(false);
    expect(hasLightConeFilters({ paths: new Set(['Mage']), rarities: new Set() })).toBe(true);
  });
});
