import runtimeJson from '../../generated/runtime/player.json' with { type: 'json' };
import type { CanonicalPlayerCharacterBuild } from '../../player/canonical.js';
import { assertPlayerRuntimeData, type PlayerRuntimeData } from '../../player/runtime-data.js';
import {
  normalizeRatingV2Build,
  type RatingV2Normalization
} from '../../relic-score/v2/normalize.js';
import { presentRatingV2 } from '../../relic-score/v2/presentation.js';
import type { PlayerRelicScorePresentationV2 } from '../../player/relic-rating-v2-contract.js';
import { getProductionRatingV2Scorer } from './benchmark-loader.js';

assertPlayerRuntimeData(runtimeJson);
export interface PlayerScoringResult {
  normalized: RatingV2Normalization;
  score: PlayerRelicScorePresentationV2;
  diagnostic?: string;
}

/** The sole production scoring entry accepts canonical relics independently of panel synthesis. */
export function scorePlayerCharacterBuild(
  build: CanonicalPlayerCharacterBuild,
  runtime: PlayerRuntimeData = runtimeJson as PlayerRuntimeData
): PlayerScoringResult {
  try {
    return getProductionRatingV2Scorer(runtime)(build);
  } catch {
    const normalized = normalizeRatingV2Build(build, runtime);
    const input = normalized.status === 'valid' ? normalized.input : normalized.partialInput;
    return {
      normalized,
      score: presentRatingV2(normalized, {
        build: { status: 'unavailable', reason: 'benchmark-unavailable' },
        pieces: input.relics.map(() => ({ status: 'unavailable', reason: 'benchmark-unavailable' }))
      }),
      diagnostic: 'BENCHMARK_MISSING_OR_STALE'
    };
  }
}
