import type { EndgameSearchNameEntry, GlobalSearchIndex } from '../domain/search-index.js';
import type { CatalogEntry, EnemyCatalogEntry, RelicCatalogEntry } from '../domain/types.js';
import {
  normalizeSearchDocument,
  SEARCH_DOCUMENT_SCHEMA_VERSION,
  type MatchEvidence
} from './documents.js';
import {
  createEndgameSearchExpander,
  emptyEndgameSearchResults,
  type EndgameSearchResults,
  type ShardFetcher
} from './endgame.js';
import { createFlexSearchAdapter } from './flexsearch-adapter.js';
import { CHARACTER_NAMING_POLICY_VERSION } from './name-metadata.js';
import { normalizeSearch, SEARCH_NORMALIZATION_VERSION } from './normalization.js';
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
  endgameMatches: EndgameSearchNameEntry[];
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

/** The only production query path. Cards continue to receive their original catalog models. */
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
  const endgame = new Map(index.endgameEnemies.map((entry) => [entry.entryId, entry]));
  const documents = new Map<string, ReturnType<typeof normalizeSearchDocument>>();
  let engine: ReturnType<typeof createFlexSearchAdapter> | undefined;
  try {
    if (
      index.schemaVersion !== SEARCH_DOCUMENT_SCHEMA_VERSION ||
      index.normalizationVersion !== SEARCH_NORMALIZATION_VERSION ||
      index.namingPolicyVersion !== CHARACTER_NAMING_POLICY_VERSION
    )
      throw new Error('SearchDocument bundle 版本不兼容');
    for (const doc of index.documents) {
      if (documents.has(doc.key)) throw new Error(`重复搜索 key：${doc.key}`);
      documents.set(doc.key, normalizeSearchDocument(doc));
    }
    engine = createFlexSearchAdapter([...documents.values()]);
  } catch (error) {
    console.error('搜索索引初始化失败', error);
  }
  const reportedMissing = new Set<string>();
  function search(query: string): GlobalSearchSnapshot {
    const snapshot: GlobalSearchSnapshot = {
      results: emptyResults(),
      endgameMatches: [],
      evidence: [],
      unavailable: !engine
    };
    const needle = normalizeSearch(query);
    if (!needle || !engine) return snapshot;
    const matches: RankedSearchMatch[] = [];
    try {
      for (const key of engine.search(needle)) {
        const normalized = documents.get(key);
        if (!normalized) throw new Error(`搜索索引返回未知 key：${key}`);
        const evidence = bestSearchEvidence(normalized, needle);
        if (evidence) matches.push({ normalized, evidence });
      }
    } catch (error) {
      console.error('搜索召回失败', error);
      snapshot.unavailable = true;
    }
    for (const {
      normalized: { document },
      evidence
    } of matches.sort(compareSearchMatches)) {
      const target = document.target;
      let found = false;
      if (target.kind === 'endgame-name') {
        const entry = endgame.get(target.entryId);
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
  return { search, expandEndgame: createEndgameSearchExpander(fetchShard) };
}
