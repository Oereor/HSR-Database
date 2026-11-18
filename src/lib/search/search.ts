import type { EndgameSearchTargetEntry, GlobalSearchIndex } from '../domain/search-index.js';
import type { CatalogEntry, EnemyCatalogEntry, RelicCatalogEntry } from '../domain/types.js';
import {
  normalizeSearchDocument,
  SEARCH_DOCUMENT_SCHEMA_VERSION,
  searchTargetKey,
  type MatchEvidence,
  type NormalizedSearchDocument,
  type SearchTarget
} from './documents.js';
import {
  createEndgameSearchExpander,
  emptyEndgameSearchResults,
  type EndgameSearchResults,
  type ShardFetcher
} from './endgame.js';
import { createFlexSearchAdapter } from './flexsearch-adapter.js';
import { CHARACTER_NAMING_POLICY_VERSION } from './name-metadata.js';
import {
  normalizeSearch,
  normalizeSearchIdQuery,
  SEARCH_NORMALIZATION_VERSION
} from './normalization.js';
import { bestSearchEvidence, compareSearchMatches, type RankedSearchMatch } from './ranking.js';

export { endgameSearchSeasonsForMode } from './endgame.js';

export interface GlobalSearchCatalogs {
  characters: CatalogEntry[];
  lightCones: CatalogEntry[];
  relics: RelicCatalogEntry[];
  enemies: EnemyCatalogEntry[];
}
export interface GlobalSearchResults extends GlobalSearchCatalogs {
  endgame: EndgameSearchResults;
}
export interface GlobalSearchSnapshot {
  results: GlobalSearchResults;
  endgameMatches: EndgameSearchTargetEntry[];
  evidence: MatchEvidence[];
  unavailable: boolean;
}
const emptyResults = (): GlobalSearchResults => ({
  characters: [],
  lightCones: [],
  relics: [],
  enemies: [],
  endgame: emptyEndgameSearchResults()
});

function createSearchMatcher(index: GlobalSearchIndex, kind?: SearchTarget['kind']) {
  const documents = new Map<string, NormalizedSearchDocument>();
  const targetsById = new Map<string, NormalizedSearchDocument[]>();
  let engine: ReturnType<typeof createFlexSearchAdapter> | undefined;
  try {
    if (
      index.schemaVersion !== SEARCH_DOCUMENT_SCHEMA_VERSION ||
      index.normalizationVersion !== SEARCH_NORMALIZATION_VERSION ||
      index.namingPolicyVersion !== CHARACTER_NAMING_POLICY_VERSION
    )
      throw new Error('SearchDocument bundle 版本不兼容');
    for (const doc of index.documents) {
      if (kind && doc.target.kind !== kind) continue;
      if (documents.has(doc.key)) throw new Error(`重复搜索 key：${doc.key}`);
      const normalized = normalizeSearchDocument(doc);
      documents.set(doc.key, normalized);
      const exactTargets = targetsById.get(doc.target.id) ?? [];
      exactTargets.push(normalized);
      targetsById.set(doc.target.id, exactTargets);
    }
    engine = createFlexSearchAdapter([...documents.values()]);
  } catch (error) {
    console.error('搜索索引初始化失败', error);
  }
  return function matchSearch(query: string) {
    if (!engine) return { matches: [], unavailable: true };
    const id = normalizeSearchIdQuery(query);
    if (!id) return { matches: [], unavailable: false };
    const matches = new Map<string, RankedSearchMatch>();
    for (const normalized of targetsById.get(id) ?? []) {
      const { key, target } = normalized.document;
      matches.set(searchTargetKey(target), {
        normalized,
        evidence: { documentKey: key, matchKind: 'id', matchedLabel: target.id }
      });
    }
    let unavailable = false;
    const needle = normalizeSearch(query);
    try {
      for (const key of engine.search(needle)) {
        const normalized = documents.get(key);
        if (!normalized) throw new Error(`搜索索引返回未知 key：${key}`);
        const targetKey = searchTargetKey(normalized.document.target);
        if (matches.get(targetKey)?.evidence.matchKind === 'id') continue;
        const evidence = bestSearchEvidence(normalized, needle);
        if (!evidence) continue;
        const candidate = { normalized, evidence };
        const previous = matches.get(targetKey);
        if (!previous || compareSearchMatches(candidate, previous) < 0)
          matches.set(targetKey, candidate);
      }
    } catch (error) {
      console.error('搜索召回失败', error);
      unavailable = true;
    }
    return { matches: [...matches.values()].sort(compareSearchMatches), unavailable };
  };
}

export function createGlobalSearchService(
  index: GlobalSearchIndex,
  catalogs: GlobalSearchCatalogs,
  fetchShard?: ShardFetcher
) {
  const models = {
    character: new Map(catalogs.characters.map((entry) => [entry.id, entry])),
    'light-cone': new Map(catalogs.lightCones.map((entry) => [entry.id, entry])),
    relic: new Map(catalogs.relics.map((entry) => [entry.id, entry])),
    enemy: new Map(catalogs.enemies.map((entry) => [entry.id, entry]))
  };
  const endgame = new Map(index.endgameTargets.map((entry) => [entry.id, entry]));
  const matchSearch = createSearchMatcher(index);
  const reportedMissing = new Set<string>();
  function search(query: string): GlobalSearchSnapshot {
    const { matches, unavailable } = matchSearch(query);
    const snapshot: GlobalSearchSnapshot = {
      results: emptyResults(),
      endgameMatches: [],
      evidence: [],
      unavailable
    };
    for (const {
      normalized: { document },
      evidence
    } of matches) {
      const target = document.target;
      let found = false;
      if (target.kind === 'endgame') {
        const entry = endgame.get(target.id);
        if (entry) {
          snapshot.endgameMatches.push(entry);
          found = true;
        }
      } else if (target.kind === 'character') {
        const model = models.character.get(target.id);
        if (model) {
          snapshot.results.characters.push(model);
          found = true;
        }
      } else if (target.kind === 'light-cone') {
        const model = models['light-cone'].get(target.id);
        if (model) {
          snapshot.results.lightCones.push(model);
          found = true;
        }
      } else if (target.kind === 'relic') {
        const model = models.relic.get(target.id);
        if (model) {
          snapshot.results.relics.push(model);
          found = true;
        }
      } else {
        const model = models.enemy.get(target.id);
        if (model) {
          snapshot.results.enemies.push(model);
          found = true;
        }
      }
      snapshot.evidence.push(evidence);
      if (!found) {
        snapshot.unavailable = true;
        if (!reportedMissing.has(document.key)) {
          console.error(`搜索资料缺失：${document.key}`);
          reportedMissing.add(document.key);
        }
      }
    }
    return snapshot;
  }
  return { search, expandEndgame: createEndgameSearchExpander(fetchShard, index.locale) };
}

export function createEndgameOccurrenceSearch(index: GlobalSearchIndex, fetchShard?: ShardFetcher) {
  const matchSearch = createSearchMatcher(index, 'endgame');
  const targets = new Map(index.endgameTargets.map((entry) => [entry.id, entry]));
  const expandEndgame = createEndgameSearchExpander(fetchShard, index.locale);
  return async (query: string) => {
    const { matches, unavailable } = matchSearch(query);
    const entries = matches.flatMap(({ normalized }) => {
      const target = targets.get(normalized.document.target.id);
      return target ? [target] : [];
    });
    const expanded = await expandEndgame(entries);
    return {
      results: expanded.results,
      unavailable: unavailable || expanded.unavailable || entries.length !== matches.length
    };
  };
}
