import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { EndgameOccurrenceShard, GlobalSearchIndex } from '../../src/lib/domain/search-index';
import type { SearchDocument } from '../../src/lib/search/documents';
import { normalizeSearchDocument } from '../../src/lib/search/documents';
import { createFlexSearchAdapter } from '../../src/lib/search/flexsearch-adapter';
import { normalizeSearch, normalizeSearchLabel } from '../../src/lib/search/normalization';
import { createGlobalSearchService, type GlobalSearchCatalogs } from '../../src/lib/search/search';
import { createEndgameSearchExpander } from '../../src/lib/search/endgame';
import { bestSearchEvidence, searchRankClass } from '../../src/lib/search/ranking';

const generated = path.resolve('src/lib/generated/catalogs');
const index = JSON.parse(readFileSync('static/generated/search.json', 'utf8')) as GlobalSearchIndex;
const catalogs: GlobalSearchCatalogs = {
  characters: JSON.parse(readFileSync(path.join(generated, 'characters.json'), 'utf8')),
  lightCones: JSON.parse(readFileSync(path.join(generated, 'light-cones.json'), 'utf8')),
  relics: JSON.parse(readFileSync(path.join(generated, 'relics.json'), 'utf8')),
  enemies: JSON.parse(readFileSync(path.join(generated, 'enemies.json'), 'utf8'))
};
const emptyCatalogs = (): GlobalSearchCatalogs => ({
  characters: [],
  lightCones: [],
  relics: [],
  enemies: []
});
const document = (
  id: string,
  canonicalName: string,
  officialAliases: string[] = [],
  playerAliases: string[] = []
): SearchDocument => ({
  key: `character:${id}`,
  target: { kind: 'character', id },
  canonicalName,
  officialAliases,
  playerAliases
});
const bundle = (documents: SearchDocument[]): GlobalSearchIndex => ({
  schemaVersion: 2,
  normalizationVersion: 1,
  namingPolicyVersion: 1,
  sourceCommit: 'fixture',
  metadataDigest: 'fixture',
  documents,
  endgameEnemies: []
});
const oracle = (docs: SearchDocument[], query: string) =>
  new Set(
    docs
      .filter(
        (doc) =>
          !!normalizeSearch(query) &&
          [doc.canonicalName, ...doc.officialAliases, ...doc.playerAliases].some((label) =>
            normalizeSearchLabel(label).includes(normalizeSearch(query))
          )
      )
      .map(({ key }) => key)
  );
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

describe('Search V2', () => {
  it('normalizes only explicit separators and preserves significant punctuation', () => {
    for (const separator of [' ', '·', '•', '・', '—', '_', '-', '/'])
      expect(normalizeSearch(`丹恒${separator}饮月`)).toBe('丹恒饮月');
    expect(normalizeSearch('ＡＢＣ')).toBe('abc');
    expect(normalizeSearch(' March 7th ')).toBe('march7th');
    expect(normalizeSearch('（完整）@official.LV.999「、」')).toBe('(完整)@official.lv.999「、」');
    expect(normalizeSearchLabel('银狼LV.<unbreak>999</unbreak>')).toBe('银狼lv.999');
    expect(normalizeSearch('<unbreak>ABC</unbreak>')).toBe('<unbreak>abc<unbreak>');
    for (const value of ['', ' —_/- ', '丹恒•饮月', 'ＡＢＣ', '(污染)'])
      expect(normalizeSearch(normalizeSearch(value))).toBe(normalizeSearch(value));
    expect(normalizeSearch(' —_/- ')).toBe('');
  });

  it('preserves domain counts and directly returns original catalog models', () => {
    expect(index.schemaVersion).toBe(2);
    expect(index.documents).toHaveLength(1127);
    expect(index.endgameEnemies).toHaveLength(173);
    expect(index.endgameEnemies.reduce((sum, entry) => sum + entry.locators.length, 0)).toBe(8167);
    const service = createGlobalSearchService(index, catalogs);
    const kafka = service.search('卡芙卡').results.characters[0];
    expect(kafka).toBe(catalogs.characters.find(({ id }) => id === kafka.id));
    expect(service.search('march').results.characters).toEqual([]);
    expect(service.search('锋镝').results.lightCones[0].id).toBe('20000');
    expect(service.search('银鬃尉官').results.enemies).toHaveLength(4);
    expect(service.search('开拓者同谐').results.characters.map(({ id }) => id)).toEqual([
      '8005',
      '8006'
    ]);
    expect(service.search('{NICKNAME}').results.characters).toEqual([]);
  });

  it('matches the independent oracle for actual names and arbitrary inner substrings', () => {
    const engine = createFlexSearchAdapter(index.documents.map(normalizeSearchDocument));
    const queries = new Set([
      '',
      ' — ',
      '不存在的搜索词',
      '三月七',
      '丹恒',
      '丹恒饮月',
      '银鬃尉官',
      '的',
      '者',
      '@official',
      'lv.999'
    ]);
    for (const doc of index.documents) {
      const label = normalizeSearchLabel(doc.canonicalName);
      queries.add(label);
      queries.add(label.slice(1, -1));
    }
    for (const query of queries)
      expect(engine.search(normalizeSearch(query)), query).toEqual(oracle(index.documents, query));
  }, 30_000);

  it.each([81, 101, 1205])(
    'keeps every key through engine, ranking and service for %i matches',
    (count) => {
      const docs = Array.from({ length: count }, (_, i) =>
        document(String(i), `测试${i}`, ['官方测试'], ['玩家测试'])
      );
      const models = {
        ...emptyCatalogs(),
        characters: docs.map((doc, i) => ({ id: String(i), name: doc.canonicalName, rarity: 5 }))
      };
      const service = createGlobalSearchService(bundle(docs), models);
      const result = service.search('测试');
      expect(new Set(result.results.characters.map(({ id }) => `character:${id}`))).toEqual(
        oracle(docs, '测试')
      );
      expect(result.evidence).toHaveLength(count);
      expect(result.unavailable).toBe(false);
    }
  );

  it('orders all nine rank classes pairwise and independently of insertion order', () => {
    const docs: SearchDocument[] = [];
    for (const [quality, label] of ['测试', '测试后缀', '前缀测试后缀'].entries()) {
      docs.push(document(String(quality * 3), label));
      docs.push(document(String(quality * 3 + 1), '别名目标甲', [label]));
      docs.push(document(String(quality * 3 + 2), '别名目标乙', [], [label]));
    }
    const models = {
      ...emptyCatalogs(),
      characters: docs.map((doc) => ({
        id: doc.key.split(':')[1],
        name: doc.canonicalName,
        rarity: 5
      }))
    };
    for (let a = 0; a < 9; a++)
      for (let b = a + 1; b < 9; b++) {
        const result = createGlobalSearchService(bundle([docs[b], docs[a]]), models).search('测试');
        expect(result.evidence.map(searchRankClass)).toEqual([a, b]);
      }
    const expected = createGlobalSearchService(bundle(docs), models).search('测试').evidence;
    // Fixed-seed shuffle, reproducible while exercising changing insertion order.
    let seed = 17;
    for (let round = 0; round < 10; round++) {
      const shuffled = [...docs];
      for (let i = shuffled.length - 1; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(createGlobalSearchService(bundle(shuffled), models).search('测试').evidence).toEqual(
        expected
      );
    }
    const evidence = bestSearchEvidence(
      normalizeSearchDocument(document('best', '测试', ['测试'], ['测试'])),
      '测试'
    );
    expect(evidence?.nameKind).toBe('canonical');
  });

  it('keeps same-name and conflicting aliases across identities and kinds without duplicate cards', () => {
    const docs = [
      document('a', '测试'),
      document('b', '测试'),
      document('c', '别名目标', ['测试'], ['测试', '测试'])
    ];
    docs.push({
      key: 'enemy:a',
      target: { kind: 'enemy', id: 'a' },
      canonicalName: '测试',
      officialAliases: [],
      playerAliases: []
    });
    const models = {
      ...emptyCatalogs(),
      characters: ['a', 'b', 'c'].map((id) => ({ id, name: id, rarity: 5 })),
      enemies: [catalogs.enemies[0]]
    };
    docs[3] = {
      ...docs[3],
      key: `enemy:${models.enemies[0].id}`,
      target: { kind: 'enemy', id: models.enemies[0].id }
    };
    const result = createGlobalSearchService(bundle(docs), models).search('测试');
    expect(result.results.characters.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(result.results.enemies).toHaveLength(1);
  });

  it('returns empty/no-result and signals corrupt target/index without crashing', () => {
    const service = createGlobalSearchService(index, catalogs);
    for (const q of ['', ' — ', '不存在的搜索词']) expect(service.search(q).evidence).toEqual([]);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        createGlobalSearchService(bundle([document('missing', '测试')]), emptyCatalogs()).search(
          '测试'
        ).unavailable
      ).toBe(true);
      const broken = { ...bundle([]), normalizationVersion: -1 };
      expect(createGlobalSearchService(broken, emptyCatalogs()).search('测试').unavailable).toBe(
        true
      );
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('Endgame exact and partial buckets coexist; normalized collision buckets stay distinct', () => {
    const b = bundle([]);
    b.endgameEnemies = ['敌人', '敌人甲', '前敌人', '敌 人'].map((name, i) => ({
      entryId: String(i),
      name,
      locators: []
    }));
    b.documents = b.endgameEnemies.map((entry) => ({
      key: `endgame-name:${entry.entryId}`,
      target: { kind: 'endgame-name', entryId: entry.entryId },
      canonicalName: entry.name,
      officialAliases: [],
      playerAliases: []
    }));
    const fetch = vi.fn();
    const result = createGlobalSearchService(b, emptyCatalogs(), fetch).search('敌人');
    expect(new Set(result.endgameMatches.map(({ entryId }) => entryId))).toEqual(
      new Set(['0', '1', '2', '3'])
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries failed shards, shares pending requests and dedupes by locator, not MonsterID', async () => {
    const locator = {
      mode: 'moc' as const,
      groupId: 1,
      encounterIndex: 0,
      battleIndex: 0,
      stageIndex: 0,
      waveIndex: 0,
      occurrenceIndex: 0
    };
    const entry = {
      entryId: 'a',
      name: '敌人',
      locators: [locator, { ...locator, stageIndex: 1 }]
    };
    const shard: EndgameOccurrenceShard = {
      schemaVersion: 1,
      entryId: 'a',
      periods: [
        {
          mode: 'moc',
          period: {
            groupId: 1,
            name: '赛期',
            dateLabel: '',
            status: 'historical',
            encounterCount: 1
          }
        }
      ],
      occurrences: {
        'moc:1:0:0:0:0:0': { key: 'moc:1:0:0:0:0:0', occurrence: occurrence('敌人'), level: 80 },
        'moc:1:0:0:1:0:0': { key: 'moc:1:0:0:1:0:0', occurrence: occurrence('敌人'), level: 90 }
      }
    };
    const fetch = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue(shard);
    const expand = createEndgameSearchExpander(fetch);
    expect((await expand([entry])).unavailable).toBe(true);
    const [a, b] = await Promise.all([expand([entry, entry]), expand([entry])]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(a.unavailable).toBe(false);
    expect(a.results.memoryOfChaos[0].enemies).toHaveLength(2);
    expect(b.results).toEqual(a.results);
  });

  it('Endgame 只匹配敌人名，按模式/赛期/occurrence 排序且缓存分片', async () => {
    const endgameIndex: GlobalSearchIndex = {
      ...bundle([]),
      endgameEnemies: [
        {
          entryId: 'boss',
          name: '迷惘之渊的裁定者',
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
    endgameIndex.documents = endgameIndex.endgameEnemies.map((entry) => ({
      key: `endgame-name:${entry.entryId}`,
      target: { kind: 'endgame-name', entryId: entry.entryId },
      canonicalName: entry.name,
      officialAliases: [],
      playerAliases: []
    }));
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
