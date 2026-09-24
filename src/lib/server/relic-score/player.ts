import recommendationsJson from '../../generated/runtime/relic-score-recommendations.json' with { type: 'json' };
import type { PlayerRelicScorePresentation } from '../../player/relic-score-contract.js';
import { presentRelicScoreResult, unavailableRelicScore } from '../../relic-score/presentation.js';
import {
  assertRelicScoreRecommendations,
  type RelicScoreRecommendationIndex
} from '../../relic-score/recommendations.js';
import type { BuildScoreResult } from '../../relic-score/score.js';
import type { PlayerBuildInput, PlayerBuildNormalization } from '../../relic-score/types.js';
import { scoreProductionBuild } from './score.js';

const rawRecommendations: unknown = recommendationsJson;
let recommendationIndex: RelicScoreRecommendationIndex | undefined;

function productionRecommendations(): RelicScoreRecommendationIndex {
  if (!recommendationIndex) {
    assertRelicScoreRecommendations(rawRecommendations);
    recommendationIndex = rawRecommendations;
  }
  return recommendationIndex;
}

export interface PlayerScoringDependencies {
  recommendations?: RelicScoreRecommendationIndex;
  score?: typeof scoreProductionBuild;
}

/** Runs once for the actual character instance, after exact numeric synthesis. */
export function scorePlayerCharacterBuild(
  normalized: PlayerBuildNormalization,
  characterId: string,
  dependencies: PlayerScoringDependencies = {}
): PlayerRelicScorePresentation {
  const input: PlayerBuildInput | undefined =
    normalized.status === 'valid' ? normalized.input : normalized.partialInput;
  if (!input) return unavailableRelicScore('score-unavailable');
  const recommendations = dependencies.recommendations ?? productionRecommendations();
  const recommendation = recommendations[characterId];
  const score: BuildScoreResult = (dependencies.score ?? scoreProductionBuild)(
    input,
    recommendation
  );
  return presentRelicScoreResult(normalized, score);
}
