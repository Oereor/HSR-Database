import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareEnemyOverviewEntries,
  getEnemyRankCategory,
  getEnemyRankLabel,
  getWeaknessMatchCount,
  hasEnemyOverviewFilters,
  matchesEnemyOverviewFilters,
  normalizeEnemyRankFilter,
  readEnemyOverviewFilterState,
  writeEnemyOverviewFilterState
} from '../../src/lib/domain/enemy-overview';
import type { Enemy, EnemyCatalogEntry } from '../../src/lib/domain/types';
import { getEnemyPortraitMap } from '../../src/lib/server/enemy-assets';

const generatedRoot = path.join(process.cwd(), 'src', 'lib', 'generated');

describe('Enemy Overview presentation', () => {
  it('将五种 raw Rank 稳定映射为三类中文语义', () => {
    expect(['Minion', 'MinionLv2'].map(getEnemyRankCategory)).toEqual(['normal', 'normal']);
    expect(getEnemyRankCategory('Elite')).toBe('elite');
    expect(['LittleBoss', 'BigBoss'].map(getEnemyRankLabel)).toEqual(['首领敌人', '首领敌人']);
    expect(normalizeEnemyRankFilter('MinionLv2')).toBe('normal');
    expect(normalizeEnemyRankFilter('elite')).toBe('elite');
  });

  it('每个目录弱点都来自对应 Template 的 defaultMonster', async () => {
    const catalog = JSON.parse(
      await readFile(path.join(generatedRoot, 'catalogs', 'enemies.json'), 'utf8')
    ) as EnemyCatalogEntry[];
    expect(catalog).toHaveLength(628);
    for (const entry of catalog) {
      const detail = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'enemies', `${entry.id}.json`), 'utf8')
      ) as Enemy;
      expect(entry.weaknesses, entry.id).toEqual(detail.defaultMonster.weaknesses);
    }
  });

  it('读取多值筛选并将旧 Rank 参数归一化为三类', () => {
    const state = readEnemyOverviewFilterState(
      new URLSearchParams('type=MinionLv2&type=Elite&weakness=Ice&weakness=Imaginary')
    );
    expect([...state.types]).toEqual(['normal', 'elite']);
    expect([...state.weaknesses]).toEqual(['Ice', 'Imaginary']);
    expect(hasEnemyOverviewFilters(state)).toBe(true);
  });

  it('类型同类 OR、弱点任意交集命中、跨类 AND', () => {
    const enemy: EnemyCatalogEntry = {
      id: '1',
      name: '测试敌方单位',
      type: 'Elite',
      weaknesses: [
        { element: 'Physical', name: '物理' },
        { element: 'Ice', name: '冰' }
      ]
    };
    expect(
      matchesEnemyOverviewFilters(enemy, {
        types: new Set(['normal', 'elite']),
        weaknesses: new Set(['Ice', 'Imaginary'])
      })
    ).toBe(true);
    expect(
      matchesEnemyOverviewFilters(enemy, {
        types: new Set(['boss']),
        weaknesses: new Set(['Ice'])
      })
    ).toBe(false);
    expect(
      matchesEnemyOverviewFilters(enemy, {
        types: new Set(['elite']),
        weaknesses: new Set(['Imaginary'])
      })
    ).toBe(false);
    expect(matchesEnemyOverviewFilters(enemy, { types: new Set(), weaknesses: new Set() })).toBe(
      true
    );
  });

  it('弱点匹配数量作为 primary，普通排序作为 secondary', () => {
    const enemy = (
      id: string,
      name: string,
      weaknesses: Array<{ element: string; name: string }>
    ): EnemyCatalogEntry => ({ id, name, type: 'Elite', weaknesses });
    const selected = new Set(['Physical', 'Ice', 'Imaginary']);
    const entries = [
      enemy('4', '丁', [{ element: 'Fire', name: '火' }]),
      enemy('3', '丙', [{ element: 'Ice', name: '冰' }]),
      enemy('2', '乙', [
        { element: 'Physical', name: '物理' },
        { element: 'Ice', name: '冰' }
      ]),
      enemy('1', '甲', [
        { element: 'Physical', name: '物理' },
        { element: 'Ice', name: '冰' },
        { element: 'Imaginary', name: '虚数' }
      ])
    ];
    expect(entries.map((entry) => getWeaknessMatchCount(entry, selected))).toEqual([0, 1, 2, 3]);
    expect(
      entries
        .filter((entry) => getWeaknessMatchCount(entry, selected) > 0)
        .sort((a, b) => compareEnemyOverviewEntries(a, b, 'id', selected))
        .map((entry) => entry.id)
    ).toEqual(['1', '2', '3']);

    const tied = [
      enemy('20', '同名', [{ element: 'Ice', name: '冰' }]),
      enemy('10', '同名', [{ element: 'Physical', name: '物理' }])
    ];
    expect(tied.sort((a, b) => compareEnemyOverviewEntries(a, b, 'name', selected))[0].id).toBe(
      '10'
    );
  });

  it('弱点未启用时完全沿用普通排序', () => {
    const entries: EnemyCatalogEntry[] = [
      { id: '2', name: '乙', type: 'Elite', weaknesses: [{ element: 'Ice', name: '冰' }] },
      {
        id: '1',
        name: '甲',
        type: 'Elite',
        weaknesses: [{ element: 'Physical', name: '物理' }]
      }
    ];
    expect(
      entries
        .slice()
        .sort((a, b) => compareEnemyOverviewEntries(a, b, 'id', new Set()))
        .map((entry) => entry.id)
    ).toEqual(['1', '2']);
    expect(
      entries
        .slice()
        .sort((a, b) => compareEnemyOverviewEntries(a, b, 'name', new Set()))
        .map((entry) => entry.name)
    ).toEqual(['甲', '乙']);
  });

  it('序列化筛选保留 query/sort 并清除 page', () => {
    const next = writeEnemyOverviewFilterState(new URLSearchParams('q=冰锋&sort=id&page=2'), {
      types: new Set(['elite', 'boss']),
      weaknesses: new Set(['Ice', 'Imaginary'])
    });
    expect(next.getAll('type')).toEqual(['elite', 'boss']);
    expect(next.getAll('weakness')).toEqual(['Ice', 'Imaginary']);
    expect(next.get('q')).toBe('冰锋');
    expect(next.get('sort')).toBe('id');
    expect(next.has('page')).toBe(false);
  });

  it('真实目录包含 3/2/1/0 个匹配弱点的验证样本', async () => {
    const catalog = JSON.parse(
      await readFile(path.join(generatedRoot, 'catalogs', 'enemies.json'), 'utf8')
    ) as EnemyCatalogEntry[];
    const selected = new Set(['Physical', 'Ice', 'Imaginary']);
    const expected = new Map([
      ['4064010', 3],
      ['8034010', 2],
      ['4034010', 1],
      ['8003040', 0]
    ]);
    for (const [id, count] of expected) {
      const entry = catalog.find((item) => item.id === id);
      expect(entry, id).toBeDefined();
      expect(getWeaknessMatchCount(entry!, selected), id).toBe(count);
    }
  });

  it('Overview 只取得本地 Enemy URL，已知缺图 Template 保持 undefined', async () => {
    const portraits = await getEnemyPortraitMap();
    expect(portraits.get(1002015)).toMatch(/^\/generated-enemy-assets\/icons\/Monster_\d+\.webp$/);
    expect(portraits.get(2002020)).toBeUndefined();
  });
});
