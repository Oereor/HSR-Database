import type {
  EntityIdentityCandidate,
  EntityMatch,
  SearchEntitiesInput
} from '../../agent/contracts.js';
import type { EntityKind } from '../../domain/types.js';
import { getSearchIndex } from '../generated.js';
import { normalizeSearchDocument, type NormalizedSearchDocument } from '../../search/documents.js';
import { createFlexSearchAdapter } from '../../search/flexsearch-adapter.js';
import { normalizeSearch } from '../../search/normalization.js';
import {
  bestSearchEvidence,
  compareSearchMatches,
  searchRankClass,
  type RankedSearchMatch
} from '../../search/ranking.js';
import { getAgentDataVersion } from './data-version.js';

let serviceCache:
  | Promise<{
      documents: Map<string, NormalizedSearchDocument>;
      engine: ReturnType<typeof createFlexSearchAdapter>;
    }>
  | undefined;

export function entityEvidenceId(type: EntityKind, id: string): string {
  return `ent1/${type}/${encodeURIComponent(id)}`;
}

function enemyTemplateId(id: string): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('Enemy search identity must be a positive safe integer');
  return value;
}

function identityFor(type: EntityKind, id: string): EntityIdentityCandidate {
  return type === 'enemy' ? { type, enemyTemplateId: enemyTemplateId(id) } : { type, id };
}

async function getService() {
  serviceCache ??= getSearchIndex('zh-CN').then((index) => {
    const documents = new Map(
      index.documents
        .filter(({ target }) => target.kind !== 'endgame')
        .map(normalizeSearchDocument)
        .map((entry) => [entry.document.key, entry])
    );
    return { documents, engine: createFlexSearchAdapter([...documents.values()]) };
  });
  return serviceCache;
}

export async function searchEntities(input: SearchEntitiesInput) {
  const [{ documents, engine }, dataVersion] = await Promise.all([
    getService(),
    getAgentDataVersion()
  ]);
  const query = normalizeSearch(input.query);
  const allowed = input.types ? new Set(input.types) : undefined;
  const ranked: RankedSearchMatch[] = [];
  for (const key of engine.search(query)) {
    const normalized = documents.get(key);
    if (!normalized || (allowed && !allowed.has(normalized.document.target.kind as never)))
      continue;
    const evidence = bestSearchEvidence(normalized, query);
    if (evidence) ranked.push({ normalized, evidence });
  }
  ranked.sort(compareSearchMatches);
  const matches: EntityMatch[] = ranked
    .slice(0, input.limit)
    .map(({ normalized, evidence }, index) => {
      const type = normalized.document.target.kind as EntityKind;
      const id = normalized.document.target.id;
      return {
        ...identityFor(type, id),
        evidenceId: entityEvidenceId(type, id),
        canonicalName: normalized.document.canonicalName,
        matchedLabel: evidence.matchedLabel,
        nameKind: evidence.nameKind,
        matchKind: evidence.matchKind,
        rank: index + 1
      } as EntityMatch;
    });
  const topRankClass = ranked[0] ? searchRankClass(ranked[0].evidence) : undefined;
  const ambiguousCandidates =
    topRankClass === undefined
      ? []
      : ranked
          .filter(({ evidence }) => searchRankClass(evidence) === topRankClass)
          .map(({ normalized }) =>
            identityFor(
              normalized.document.target.kind as EntityKind,
              normalized.document.target.id
            )
          );
  return {
    dataVersion,
    normalizedQuery: query,
    matches,
    truncated: ranked.length > matches.length,
    ambiguity: {
      ambiguous: ambiguousCandidates.length > 1,
      candidates: ambiguousCandidates.slice(0, input.limit)
    }
  };
}
