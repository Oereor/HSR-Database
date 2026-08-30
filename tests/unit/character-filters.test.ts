import { describe, expect, it } from 'vitest';
import {
  hasCharacterFilters,
  matchesCharacterFilters,
  readCharacterFilterState,
  writeCharacterFilterState
} from '../../src/lib/domain/character-filters';

const character = {
  id: '1001',
  name: '三月七',
  path: 'Knight',
  element: 'Ice',
  rarity: 4
};

describe('角色多选筛选', () => {
  it('读取重复参数并兼容单值参数', () => {
    const state = readCharacterFilterState(
      new URLSearchParams('path=Rogue&path=Warlock&element=Fire&rarity=5')
    );
    expect([...state.paths]).toEqual(['Rogue', 'Warlock']);
    expect([...state.elements]).toEqual(['Fire']);
    expect([...state.rarities]).toEqual(['5']);
  });

  it('同类 OR、跨类 AND，空集合代表全部', () => {
    expect(
      matchesCharacterFilters(character, {
        paths: new Set(['Knight', 'Rogue']),
        elements: new Set(['Fire', 'Ice']),
        rarities: new Set(['4'])
      })
    ).toBe(true);
    expect(
      matchesCharacterFilters(character, {
        paths: new Set(['Knight']),
        elements: new Set(['Fire']),
        rarities: new Set()
      })
    ).toBe(false);
    expect(
      matchesCharacterFilters(character, {
        paths: new Set(),
        elements: new Set(),
        rarities: new Set()
      })
    ).toBe(true);
  });

  it('序列化筛选时保留 query/sort，清除 page', () => {
    const params = new URLSearchParams('q=三月七&sort=name&page=2');
    const next = writeCharacterFilterState(params, {
      paths: new Set(['Rogue', 'Warlock']),
      elements: new Set(['Fire']),
      rarities: new Set(['5'])
    });
    expect(next.getAll('path')).toEqual(['Rogue', 'Warlock']);
    expect(next.getAll('element')).toEqual(['Fire']);
    expect(next.getAll('rarity')).toEqual(['5']);
    expect(next.get('q')).toBe('三月七');
    expect(next.get('sort')).toBe('name');
    expect(next.has('page')).toBe(false);
  });

  it('可判断是否存在 active filters', () => {
    expect(
      hasCharacterFilters({ paths: new Set(), elements: new Set(), rarities: new Set() })
    ).toBe(false);
    expect(
      hasCharacterFilters({ paths: new Set(['Knight']), elements: new Set(), rarities: new Set() })
    ).toBe(true);
  });
});
