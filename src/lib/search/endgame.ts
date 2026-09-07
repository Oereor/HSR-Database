import type { EndgameMode } from '../domain/endgame.js';
import {
  ENDGAME_MODES,
  type EndgameEnemyGridItem,
  type EndgamePeriodView
} from '../domain/endgame-view.js';
import {
  endgameOccurrenceLocatorKey,
  type EndgameOccurrenceOrder,
  type EndgameOccurrenceShard,
  type EndgameSearchTargetEntry,
  type SearchLocale
} from '../domain/search-index.js';

export interface EndgameSearchSeasonResult {
  period: EndgamePeriodView;
  enemies: EndgameEnemyGridItem[];
}

export interface EndgameSearchResults {
  memoryOfChaos: EndgameSearchSeasonResult[];
  pureFiction: EndgameSearchSeasonResult[];
  apocalypticShadow: EndgameSearchSeasonResult[];
  anomalyArbitration: EndgameSearchSeasonResult[];
}

const ENDGAME_RESULT_KEY_BY_MODE = {
  moc: 'memoryOfChaos',
  pf: 'pureFiction',
  as: 'apocalypticShadow',
  aa: 'anomalyArbitration'
} as const satisfies Record<EndgameMode, keyof EndgameSearchResults>;

export const emptyEndgameSearchResults = (): EndgameSearchResults => ({
  memoryOfChaos: [],
  pureFiction: [],
  apocalypticShadow: [],
  anomalyArbitration: []
});

export function endgameSearchSeasonsForMode(results: EndgameSearchResults, mode: EndgameMode) {
  return results[ENDGAME_RESULT_KEY_BY_MODE[mode]];
}

export interface ExpandedEndgameResults {
  results: EndgameSearchResults;
  unavailable: boolean;
}

export type ShardFetcher = (
  targetId: string,
  locale: SearchLocale
) => Promise<EndgameOccurrenceShard>;

function occurrenceOrder(a: EndgameOccurrenceOrder, b: EndgameOccurrenceOrder): number {
  return (
    a.encounter - b.encounter ||
    a.battle - b.battle ||
    a.stage - b.stage ||
    a.wave - b.wave ||
    a.card - b.card
  );
}

export function createEndgameSearchExpander(
  fetchShard: ShardFetcher = async (targetId, locale) => {
    const response = await fetch(`/generated/${locale}/endgame-occurrences/${targetId}`);
    if (!response.ok) throw new Error(`Endgame 搜索分片加载失败：${response.status}`);
    return (await response.json()) as EndgameOccurrenceShard;
  },
  locale: SearchLocale = 'zh-CN'
) {
  const shardCache = new Map<string, Promise<EndgameOccurrenceShard>>();
  const loadShard = (targetId: string) => {
    const cacheKey = `${locale}:${targetId}`;
    let pending = shardCache.get(cacheKey);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => fetchShard(targetId, locale))
        .then((shard) => {
          if (
            shard.schemaVersion !== 2 ||
            shard.locale !== locale ||
            shard.target.kind !== 'endgame' ||
            shard.target.id !== targetId
          )
            throw new Error(`Endgame 分片身份错误：${targetId}`);
          return shard;
        })
        .catch((error: unknown) => {
          if (shardCache.get(cacheKey) === pending) shardCache.delete(cacheKey);
          throw error;
        });
      shardCache.set(cacheKey, pending);
    }
    return pending;
  };
  async function expandEndgame(
    matches: EndgameSearchTargetEntry[]
  ): Promise<ExpandedEndgameResults> {
    const loaded = await Promise.all(
      matches.map(async (entry) => {
        try {
          return { entry, shard: await loadShard(entry.id) };
        } catch (error) {
          console.error(`Endgame 搜索分片不可用：${entry.id}`, error);
          return { entry, shard: undefined };
        }
      })
    );
    const grouped = new Map<
      string,
      {
        mode: EndgameMode;
        period: EndgamePeriodView;
        enemies: Array<{ order: EndgameOccurrenceOrder; item: EndgameEnemyGridItem }>;
      }
    >();
    let unavailable = false;
    const seenLocators = new Set<string>();
    for (const { entry, shard } of loaded) {
      if (!shard) {
        unavailable = true;
        continue;
      }
      const periods = new Map(
        shard.periods.map(({ mode, period }) => [`${mode}:${period.groupId}`, period])
      );
      for (const { locator, order } of entry.occurrences) {
        const locatorKey = endgameOccurrenceLocatorKey(locator);
        if (seenLocators.has(locatorKey)) continue;
        const key = `${locator.mode}:${locator.groupId}`;
        const period = periods.get(key);
        const item = shard.occurrences[endgameOccurrenceLocatorKey(locator)];
        if (!period || !item) {
          console.error(`Endgame 搜索引用缺失：${entry.id} / ${locatorKey}`);
          unavailable = true;
          continue;
        }
        const season = grouped.get(key) ?? { mode: locator.mode, period, enemies: [] };
        seenLocators.add(locatorKey);
        season.enemies.push({ order, item });
        grouped.set(key, season);
      }
    }
    const results = emptyEndgameSearchResults();
    for (const mode of ENDGAME_MODES) {
      results[ENDGAME_RESULT_KEY_BY_MODE[mode]] = [...grouped.values()]
        .filter((season) => season.mode === mode)
        .sort((a, b) => b.period.groupId - a.period.groupId)
        .map(({ period, enemies }) => ({
          period,
          enemies: enemies.sort((a, b) => occurrenceOrder(a.order, b.order)).map(({ item }) => item)
        }));
    }
    return { results, unavailable };
  }

  return expandEndgame;
}
