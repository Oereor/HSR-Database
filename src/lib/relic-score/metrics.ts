import type { RelicScoreRecommendation } from './recommendations.js';
import type { NormalizedRelicPiece } from './types.js';
import { RELIC_SCORE_CONFIG } from './scoring-config.js';
export interface EffectiveHits {
  status: 'exact' | 'partial' | 'unavailable';
  known: number;
  unknownRecommendedSubstats: number;
  total: number | null;
}
export function calculateEffectiveHits(
  piece: NormalizedRelicPiece,
  recommendation: RelicScoreRecommendation
): EffectiveHits {
  const recommended = new Set(recommendation.subStatPropertyTypes);
  let known = 0;
  let unknownRecommendedSubstats = 0;
  for (const sub of piece.substats) {
    if (!recommended.has(sub.key)) continue;
    if (sub.rollCount.status === 'exact') known += sub.rollCount.count;
    else unknownRecommendedSubstats++;
  }
  return {
    status: unknownRecommendedSubstats ? (known ? 'partial' : 'unavailable') : 'exact',
    known,
    unknownRecommendedSubstats,
    total: unknownRecommendedSubstats ? null : known
  };
}

export interface SetIntegrity {
  cavern: number;
  planar: number;
  total: number;
  matchedCavernSetId: string | null;
  matchedPlanarSetId: string | null;
}
export function evaluateSetIntegrity(
  pieces: readonly NormalizedRelicPiece[],
  recommendation: RelicScoreRecommendation
): SetIntegrity {
  const cavern = pieces.filter((piece) => ['HEAD', 'HAND', 'BODY', 'FOOT'].includes(piece.slot));
  const planar = pieces.filter((piece) => ['NECK', 'OBJECT'].includes(piece.slot));
  const cavernCounts = new Map<string, number>();
  for (const piece of cavern)
    cavernCounts.set(piece.setId, (cavernCounts.get(piece.setId) ?? 0) + 1);
  const fullCavernSetId = [...cavernCounts].find(([, count]) => count === 4)?.[0] ?? null;
  const cavernPairCount = [...cavernCounts.values()].filter((count) => count >= 2).length;
  const matchedCavernSetId =
    fullCavernSetId && recommendation.cavernSetIds.includes(fullCavernSetId)
      ? fullCavernSetId
      : null;
  const cavernIntegrity = fullCavernSetId
    ? matchedCavernSetId
      ? RELIC_SCORE_CONFIG.sets.cavernRecommended4pc
      : RELIC_SCORE_CONFIG.sets.cavernOther4pc
    : cavernPairCount === 2
      ? RELIC_SCORE_CONFIG.sets.cavernTwoPairs
      : cavernPairCount === 1
        ? RELIC_SCORE_CONFIG.sets.cavernOnePair
        : 0;
  const fullPlanarSetId =
    planar.length === 2 && planar[0].setId === planar[1].setId ? planar[0].setId : null;
  const matchedPlanarSetId =
    fullPlanarSetId && recommendation.planarSetIds.includes(fullPlanarSetId)
      ? fullPlanarSetId
      : null;
  const planarIntegrity = fullPlanarSetId
    ? matchedPlanarSetId
      ? RELIC_SCORE_CONFIG.sets.planarRecommended2pc
      : RELIC_SCORE_CONFIG.sets.planarOther2pc
    : 0;
  return {
    cavern: cavernIntegrity,
    planar: planarIntegrity,
    total:
      RELIC_SCORE_CONFIG.sets.cavernShare * cavernIntegrity +
      RELIC_SCORE_CONFIG.sets.planarShare * planarIntegrity,
    matchedCavernSetId,
    matchedPlanarSetId
  };
}
