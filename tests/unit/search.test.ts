import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { EndgameOccurrenceShard, GlobalSearchIndex } from '../../src/lib/domain/search-index';
import type {
  CatalogEntry,
  EnemyCatalogEntry,
  RelicCatalogEntry,
  SearchEntry
} from '../../src/lib/domain/types';
import {
  createGlobalSearchService,
  normalizeSearch,
  searchEntries,
  searchMatchScore
} from '../../src/lib/search/search';

const generated = path.resolve('src/lib/generated/catalogs');
const index = JSON.parse(
  readFileSync(path.resolve('static/generated/search.json'), 'utf8')
) as GlobalSearchIndex;
const catalogs = {
  characters: JSON.parse(
    readFileSync(path.join(generated, 'characters.json'), 'utf8')
  ) as CatalogEntry[],
  lightCones: JSON.parse(
    readFileSync(path.join(generated, 'light-cones.json'), 'utf8')
  ) as CatalogEntry[],
  relics: JSON.parse(
    readFileSync(path.join(generated, 'relics.json'), 'utf8')
  ) as RelicCatalogEntry[],
  enemies: JSON.parse(
    readFileSync(path.join(generated, 'enemies.json'), 'utf8')
  ) as EnemyCatalogEntry[]
};

const occurrence = (name: string) => ({
  identity: name,
  monsterId: 1,
  monsterTemplateId: 2,
  name,
  weaknesses: [],
  hp: { roundedPerBar: '1' },
  speed: { rounded: '1' },
  toughness: { roundedPerBar: '1' }
});

describe('搜索', () => {
  it('规范化 Unicode、空格、标点与大小写', () => {
    expect(normalizeSearch(' March 7th ')).toBe('march7th');
    expect(searchMatchScore(['自动机兵•甲虫'], '自动机兵 甲虫')).toBeGreaterThan(0);
    expect(searchMatchScore(['ＡＢＣ'], 'abc')).toBe(100);
  });

  it('保留旧 ranking API 的 exact、prefix、contains、alias 与 80 条上限', () => {
    const records: SearchEntry[] = [
      { id: 'exact', kind: 'enemy', name: '测试', href: '/enemies/exact', aliases: [] },
      { id: 'prefix', kind: 'enemy', name: '测试前缀', href: '/enemies/prefix', aliases: [] },
      {
        id: 'contains',
        kind: 'enemy',
        name: '包含测试名称',
        href: '/enemies/contains',
        aliases: []
      },
      {
        id: 'alias',
        kind: 'enemy',
        name: '别名目标',
        href: '/enemies/alias',
        aliases: ['测试别名']
      }
    ];
    expect(searchEntries(records, '测试').map(({ id }) => id)).toEqual([
      'exact',
      'alias',
      'prefix',
      'contains'
    ]);
    expect(
      searchEntries(
        Array.from({ length: 100 }, (_, id) => ({
          id: String(id),
          kind: 'enemy' as const,
          name: `测试敌人${id}`,
          href: `/enemies/${id}`,
          aliases: []
        })),
        '测试敌人'
      )
    ).toHaveLength(80);
  });

  it('生成索引保留全部 8,167 个展示 locator，并只扫描 173 个唯一名称', () => {
    expect(index.schemaVersion).toBe(1);
    expect(index.entities).toHaveLength(954);
    expect(index.endgameEnemies).toHaveLength(173);
    expect(index.endgameEnemies.reduce((sum, entry) => sum + entry.locators.length, 0)).toBe(8167);
  });

  it('普通实体解析后直接返回原 catalog model', () => {
    const service = createGlobalSearchService(index, catalogs);
    const kafka = service.search('卡芙卡').results.characters[0];
    expect(kafka).toBe(catalogs.characters.find(({ id }) => id === kafka.id));
    expect(service.search('march').results.characters).toEqual([]);
    expect(service.search('锋镝').results.lightCones[0].id).toBe('20000');
  });

  it('exact Map 为 normalized collision 保留多个目标', () => {
    const collisionIndex: GlobalSearchIndex = {
      schemaVersion: 1,
      entities: [
        { kind: 'character', id: 'a', name: 'ＡＢＣ', normalizedLabels: ['abc'] },
        { kind: 'character', id: 'b', name: 'abc', normalizedLabels: ['abc'] }
      ],
      endgameEnemies: []
    };
    const characters = [
      { id: 'a', name: 'ＡＢＣ', rarity: 5 },
      { id: 'b', name: 'abc', rarity: 4 }
    ];
    const result = createGlobalSearchService(collisionIndex, {
      characters,
      lightCones: [],
      relics: [],
      enemies: []
    }).search('abc').results.characters;
    expect(result.map(({ id }) => id).sort()).toEqual(['a', 'b']);
  });

  it('Endgame 只匹配敌人名，按模式/赛期/occurrence 排序且缓存分片', async () => {
    const endgameIndex: GlobalSearchIndex = {
      schemaVersion: 1,
      entities: [],
      endgameEnemies: [
        {
          entryId: 'boss',
          name: '迷惘之渊的裁定者',
          normalizedName: '迷惘之渊的裁定者',
          locators: [
            {
              mode: 'as',
              groupId: 3010,
              encounterIndex: 0,
              battleIndex: 0,
              stageIndex: 0,
              waveIndex: 0,
              occurrenceIndex: 0
            },
            {
              mode: 'as',
              groupId: 3018,
              encounterIndex: 1,
              battleIndex: 0,
              stageIndex: 0,
              waveIndex: 0,
              occurrenceIndex: 1
            },
            {
              mode: 'as',
              groupId: 3018,
              encounterIndex: 0,
              battleIndex: 0,
              stageIndex: 0,
              waveIndex: 0,
              occurrenceIndex: 0
            }
          ]
        }
      ]
    };
    const period = (groupId: number) => ({
      groupId,
      name: groupId === 3018 ? '遗忘冽风' : '旧赛期',
      dateLabel: '',
      status: 'historical' as const,
      encounterCount: 2
    });
    const shard: EndgameOccurrenceShard = {
      schemaVersion: 1,
      entryId: 'boss',
      periods: [
        { mode: 'as', period: period(3018) },
        { mode: 'as', period: period(3010) }
      ],
      occurrences: {
        'as:3010:0:0:0:0:0': { key: 'old', occurrence: occurrence('迷惘之渊的裁定者'), level: 90 },
        'as:3018:1:0:0:0:1': {
          key: 'second',
          occurrence: occurrence('迷惘之渊的裁定者'),
          level: 90
        },
        'as:3018:0:0:0:0:0': { key: 'first', occurrence: occurrence('迷惘之渊的裁定者'), level: 60 }
      }
    };
    const fetchShard = vi.fn(async () => shard);
    const service = createGlobalSearchService(
      endgameIndex,
      {
        characters: [],
        lightCones: [],
        relics: [],
        enemies: []
      },
      fetchShard
    );
    expect(service.search('遗忘冽风').endgameMatches).toEqual([]);
    const matches = service.search('迷惘之渊 的裁定者').endgameMatches;
    const first = await service.expandEndgame(matches);
    await service.expandEndgame(matches);
    expect(fetchShard).toHaveBeenCalledTimes(1);
    expect(first.results.apocalypticShadow.map(({ period }) => period.groupId)).toEqual([
      3018, 3010
    ]);
    expect(first.results.apocalypticShadow[0].enemies.map(({ key }) => key)).toEqual([
      'first',
      'second'
    ]);
  });
});
