import type { AvatarEquipmentRecommendation } from '../../domain/types.js';
import { scoreBuild, type BuildScoreResult } from '../../relic-score/score.js';
import type { PlayerBuildInput } from '../../relic-score/types.js';
import { getProductionBenchmarkContext } from './benchmark-loader.js';

/** Internal server scoring entry; the current Player API response is unchanged. */
export function scoreProductionBuild(
  input: PlayerBuildInput,
  recommendation?: AvatarEquipmentRecommendation
): BuildScoreResult {
  const context = getProductionBenchmarkContext();
  if (context.status !== 'available')
    return { status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE', pieces: [] };
  return scoreBuild(input, {
    profile: context.profiles.profiles.find((profile) => profile.characterId === input.characterId),
    recommendation,
    reference: context.reference,
    benchmark: context.artifact,
    benchmarkExpected: context.expected
  });
}
