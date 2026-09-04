import type { MatchEvidence, MatchKind, NameKind, NormalizedSearchDocument } from './documents.js';
import { compareSearchText } from './normalization.js';

const AUTHORITY: Record<NameKind, number> = { canonical: 0, official: 1, player: 2 };
const QUALITY: Record<MatchKind, number> = { exact: 0, prefix: 1, contains: 2 };
const KINDS = ['character', 'light-cone', 'relic', 'enemy', 'endgame-name'];
export const searchRankClass = (evidence: MatchEvidence): number =>
  QUALITY[evidence.matchKind] * 3 + AUTHORITY[evidence.nameKind];
export interface RankedSearchMatch {
  normalized: NormalizedSearchDocument;
  evidence: MatchEvidence;
}

export function bestSearchEvidence(
  entry: NormalizedSearchDocument,
  query: string
): MatchEvidence | undefined {
  if (!query) return;
  let best: MatchEvidence | undefined;
  for (const label of entry.labels) {
    const matchKind =
      label.normalized === query
        ? 'exact'
        : label.normalized.startsWith(query)
          ? 'prefix'
          : label.normalized.includes(query)
            ? 'contains'
            : undefined;
    if (!matchKind) continue;
    const candidate: MatchEvidence = {
      documentKey: entry.document.key,
      nameKind: label.nameKind,
      matchKind,
      matchedLabel: label.value
    };
    if (
      !best ||
      searchRankClass(candidate) < searchRankClass(best) ||
      (searchRankClass(candidate) === searchRankClass(best) &&
        compareSearchText(candidate.matchedLabel, best.matchedLabel) < 0)
    )
      best = candidate;
  }
  return best;
}

export function compareSearchMatches(a: RankedSearchMatch, b: RankedSearchMatch): number {
  return (
    searchRankClass(a.evidence) - searchRankClass(b.evidence) ||
    compareSearchText(a.normalized.canonical, b.normalized.canonical) ||
    KINDS.indexOf(a.normalized.document.target.kind) -
      KINDS.indexOf(b.normalized.document.target.kind) ||
    compareSearchText(a.normalized.document.key, b.normalized.document.key)
  );
}
