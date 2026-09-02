import type { EndgameMode } from '$lib/domain/endgame';
import {
  ENDGAME_MODES,
  type EndgameEnemyGridItem,
  type EndgamePeriodView
} from '$lib/domain/endgame-view';
import {
  endgameOccurrenceLocatorKey,
  normalizeSearch,
  normalizeSearchLabel,
  type EndgameOccurrenceLocator,
  type EndgameOccurrenceShard,
  type EndgameSearchNameEntry,
  type GlobalSearchEntityEntry,
  type GlobalSearchIndex
} from '$lib/domain/search-index';
import type {
  CatalogEntry,
  EnemyCatalogEntry,
  EntityKind,
  RelicCatalogEntry,
  SearchEntry
} from '$lib/domain/types';

export { normalizeSearch } from '$lib/domain/search-index';

function scoreNormalizedLabels(labels: readonly string[], needle: string): number {
  if (!needle) return 0;
  let best = 0;
  for (const label of labels) {
    if (label === needle) return 100;
    if (label.startsWith(needle)) best = Math.max(best, 80 - label.length / 100);
    else if (label.includes(needle)) best = Math.max(best, 50 - label.indexOf(needle) / 100);
  }
  return best;
}

export function searchMatchScore(labels: string[], query: string): number {
  return scoreNormalizedLabels(labels.map(normalizeSearchLabel), normalizeSearch(query));
}

export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  return entries
    .map((entry) => ({
      entry,
      score: scoreNormalizedLabels([entry.name, ...entry.aliases].map(normalizeSearchLabel), needle)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'zh-CN'))
    .slice(0, 80)
    .map(({ entry }) => entry);
}

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

export interface GlobalSearchResults {
  characters: CatalogEntry[];
  lightCones: CatalogEntry[];
  relics: RelicCatalogEntry[];
  enemies: EnemyCatalogEntry[];
  endgame: EndgameSearchResults;
}

export interface GlobalSearchCatalogs {
  characters: CatalogEntry[];
  lightCones: CatalogEntry[];
  relics: RelicCatalogEntry[];
  enemies: EnemyCatalogEntry[];
}

export interface GlobalSearchSnapshot {
  results: GlobalSearchResults;
  endgameMatches: EndgameSearchNameEntry[];
}

export interface ExpandedEndgameResults {
  results: EndgameSearchResults;
  unavailable: boolean;
}

type ShardFetcher = (entryId: string) => Promise<EndgameOccurrenceShard>;

function locatorOrder(a: EndgameOccurrenceLocator, b: EndgameOccurrenceLocator): number {
  return (
    a.encounterIndex - b.encounterIndex ||
    a.battleIndex - b.battleIndex ||
    a.stageIndex - b.stageIndex ||
    a.waveIndex - b.waveIndex ||
    a.occurrenceIndex - b.occurrenceIndex
  );
}

export function createGlobalSearchService(
  index: GlobalSearchIndex,
  catalogs: GlobalSearchCatalogs,
  fetchShard: ShardFetcher = async (entryId) => {
    const response = await fetch(`/generated/endgame-occurrences/${entryId}`);
    if (!response.ok) throw new Error(`Endgame 搜索分片加载失败：${response.status}`);
    return (await response.json()) as EndgameOccurrenceShard;
  }
) {
  const entitiesByKind = new Map<EntityKind, GlobalSearchEntityEntry[]>();
  const exactByKind = new Map<EntityKind, Map<string, GlobalSearchEntityEntry[]>>();
  for (const entry of index.entities) {
    const entries = entitiesByKind.get(entry.kind) ?? [];
    entries.push(entry);
    entitiesByKind.set(entry.kind, entries);
    const exact = exactByKind.get(entry.kind) ?? new Map<string, GlobalSearchEntityEntry[]>();
    exactByKind.set(entry.kind, exact);
    for (const label of entry.normalizedLabels) {
      const targets = exact.get(label) ?? [];
      if (!targets.includes(entry)) targets.push(entry);
      exact.set(label, targets);
    }
  }

  const models = {
    character: new Map(catalogs.characters.map((entry) => [entry.id, entry])),
    'light-cone': new Map(catalogs.lightCones.map((entry) => [entry.id, entry])),
    relic: new Map(catalogs.relics.map((entry) => [entry.id, entry])),
    enemy: new Map(catalogs.enemies.map((entry) => [entry.id, entry]))
  };
  const endgameExact = new Map<string, EndgameSearchNameEntry[]>();
  for (const entry of index.endgameEnemies) {
    const targets = endgameExact.get(entry.normalizedName) ?? [];
    targets.push(entry);
    endgameExact.set(entry.normalizedName, targets);
  }
  const shardCache = new Map<string, Promise<EndgameOccurrenceShard>>();
  const loadShard = (entryId: string) => {
    let pending = shardCache.get(entryId);
    if (!pending) {
      pending = fetchShard(entryId);
      shardCache.set(entryId, pending);
    }
    return pending;
  };

  function search(query: string): GlobalSearchSnapshot {
    const needle = normalizeSearch(query);
    const results: GlobalSearchResults = {
      characters: [],
      lightCones: [],
      relics: [],
      enemies: [],
      endgame: emptyEndgameSearchResults()
    };
    if (!needle) return { results, endgameMatches: [] };

    const matches: Array<{ entry: GlobalSearchEntityEntry; score: number }> = [];
    for (const kind of ['character', 'light-cone', 'relic', 'enemy'] as const) {
      const exact = exactByKind.get(kind)?.get(needle);
      if (exact?.length) matches.push(...exact.map((entry) => ({ entry, score: 100 })));
      else
        for (const entry of entitiesByKind.get(kind) ?? []) {
          const score = scoreNormalizedLabels(entry.normalizedLabels, needle);
          if (score > 0) matches.push({ entry, score });
        }
    }
    matches
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'zh-CN'))
      .slice(0, 80)
      .forEach(({ entry }) => {
        if (entry.kind === 'character') {
          const model = models.character.get(entry.id);
          if (model) results.characters.push(model);
        } else if (entry.kind === 'light-cone') {
          const model = models['light-cone'].get(entry.id);
          if (model) results.lightCones.push(model);
        } else if (entry.kind === 'relic') {
          const model = models.relic.get(entry.id);
          if (model) results.relics.push(model);
        } else {
          const model = models.enemy.get(entry.id);
          if (model) results.enemies.push(model);
        }
      });

    const exactEndgame = endgameExact.get(needle);
    const endgameMatches =
      exactEndgame ??
      index.endgameEnemies.filter(
        ({ normalizedName }) => scoreNormalizedLabels([normalizedName], needle) > 0
      );
    return { results, endgameMatches };
  }

  async function expandEndgame(matches: EndgameSearchNameEntry[]): Promise<ExpandedEndgameResults> {
    const loaded = await Promise.all(
      matches.map(async (entry) => {
        try {
          return { entry, shard: await loadShard(entry.entryId) };
        } catch {
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
    for (const { entry, shard } of loaded) {
      if (!shard) {
        unavailable = true;
        continue;
      }
      const periods = new Map(
        shard.periods.map(({ mode, period }) => [`${mode}:${period.groupId}`, period])
      );
      for (const locator of entry.locators) {
        const key = `${locator.mode}:${locator.groupId}`;
        const period = periods.get(key);
        const item = shard.occurrences[endgameOccurrenceLocatorKey(locator)];
        if (!period || !item) {
          unavailable = true;
          continue;
        }
        const season = grouped.get(key) ?? { mode: locator.mode, period, enemies: [] };
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

  return { search, expandEndgame };
}
