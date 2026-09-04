import type { EndgameMode } from '../domain/endgame.js';
import {
  ENDGAME_MODES,
  type EndgameEnemyGridItem,
  type EndgamePeriodView
} from '../domain/endgame-view.js';
import {
  endgameOccurrenceLocatorKey,
  type EndgameOccurrenceLocator,
  type EndgameOccurrenceShard,
  type EndgameSearchNameEntry
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

export type ShardFetcher = (entryId: string) => Promise<EndgameOccurrenceShard>;

function locatorOrder(a: EndgameOccurrenceLocator, b: EndgameOccurrenceLocator): number {
  return (
    a.encounterIndex - b.encounterIndex ||
    a.battleIndex - b.battleIndex ||
    a.stageIndex - b.stageIndex ||
    a.waveIndex - b.waveIndex ||
    a.occurrenceIndex - b.occurrenceIndex
  );
}

export function createEndgameSearchExpander(
  fetchShard: ShardFetcher = async (entryId) => {
    const response = await fetch(`/generated/endgame-occurrences/${entryId}`);
    if (!response.ok) throw new Error(`Endgame 搜索分片加载失败：${response.status}`);
    return (await response.json()) as EndgameOccurrenceShard;
  }
) {
  const shardCache = new Map<string, Promise<EndgameOccurrenceShard>>();
  const loadShard = (entryId: string) => {
    let pending = shardCache.get(entryId);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => fetchShard(entryId))
        .then((shard) => {
          if (shard.entryId !== entryId || shard.schemaVersion !== 1)
            throw new Error(`Endgame 分片身份错误：${entryId}`);
          return shard;
        })
        .catch((error: unknown) => {
          if (shardCache.get(entryId) === pending) shardCache.delete(entryId);
          throw error;
        });
      shardCache.set(entryId, pending);
    }
    return pending;
  };
  async function expandEndgame(matches: EndgameSearchNameEntry[]): Promise<ExpandedEndgameResults> {
    const loaded = await Promise.all(
      matches.map(async (entry) => {
        try {
          return { entry, shard: await loadShard(entry.entryId) };
        } catch (error) {
          console.error(`Endgame 搜索分片不可用：${entry.entryId}`, error);
          return { entry, shard: undefined };
        }
      })
    );
    const grouped = new Map<
      string,
      {
        mode: EndgameMode;
        period: EndgamePeriodView;
        enemies: Array<{ locator: EndgameOccurrenceLocator; item: EndgameEnemyGridItem }>;
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
      for (const locator of entry.locators) {
        const locatorKey = endgameOccurrenceLocatorKey(locator);
        if (seenLocators.has(locatorKey)) continue;
        const key = `${locator.mode}:${locator.groupId}`;
        const period = periods.get(key);
        const item = shard.occurrences[endgameOccurrenceLocatorKey(locator)];
        if (!period || !item) {
          console.error(`Endgame 搜索引用缺失：${entry.entryId} / ${locatorKey}`);
          unavailable = true;
          continue;
        }
        const season = grouped.get(key) ?? { mode: locator.mode, period, enemies: [] };
        seenLocators.add(locatorKey);
        season.enemies.push({ locator, item });
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
          enemies: enemies
            .sort((a, b) => locatorOrder(a.locator, b.locator))
            .map(({ item }) => item)
        }));
    }
    return { results, unavailable };
  }

  return expandEndgame;
}
