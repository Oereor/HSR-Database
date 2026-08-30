import { describe, expect, it } from 'vitest';
import {
  hasRelicFilters,
  matchesRelicFilters,
  readRelicFilterState,
  writeRelicFilterState
} from '../../src/lib/domain/relic-filters';
import type { RelicCatalogEntry } from '../../src/lib/domain/types';

const cavern = {
  id: '101',
  name: '云无留迹的过客',
  category: 'cavern',
  effectRequirements: [2, 4]
} satisfies RelicCatalogEntry;

const planar = {
  id: '301',
  name: '太空封印站',
  category: 'planar',
  effectRequirements: [2]
} satisfies RelicCatalogEntry;

describe('遗器类别单选筛选', () => {
  it('读取历史 type 参数并忽略非法值', () => {
    expect(readRelicFilterState(new URLSearchParams('type=cavern'))).toEqual({
      category: 'cavern'
    });
    expect(readRelicFilterState(new URLSearchParams('type=unknown'))).toEqual({
      category: undefined
    });
    expect(readRelicFilterState(new URLSearchParams('type=unknown&type=planar'))).toEqual({
      category: 'planar'
    });
  });

  it('只匹配当前类别，未选择时匹配全部', () => {
    expect(matchesRelicFilters(cavern, { category: undefined })).toBe(true);
    expect(matchesRelicFilters(cavern, { category: 'cavern' })).toBe(true);
    expect(matchesRelicFilters(planar, { category: 'cavern' })).toBe(false);
  });

  it('写入时覆盖重复类别参数并保留 query/sort、清除 page', () => {
    const next = writeRelicFilterState(
      new URLSearchParams('q=太空&type=cavern&type=planar&sort=name&page=2'),
      { category: 'planar' }
    );
    expect(next.getAll('type')).toEqual(['planar']);
    expect(next.get('q')).toBe('太空');
    expect(next.get('sort')).toBe('name');
    expect(next.has('page')).toBe(false);
  });

  it('清除类别时保留其他状态并正确报告 active filter', () => {
    const next = writeRelicFilterState(new URLSearchParams('q=云&type=cavern&sort=id&page=2'), {
      category: undefined
    });
    expect(next.has('type')).toBe(false);
    expect(next.get('q')).toBe('云');
    expect(next.get('sort')).toBe('id');
    expect(next.has('page')).toBe(false);
    expect(hasRelicFilters({ category: undefined })).toBe(false);
    expect(hasRelicFilters({ category: 'planar' })).toBe(true);
  });
});
