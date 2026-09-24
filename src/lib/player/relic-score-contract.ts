import type { RelicSlot } from '../domain/types.js';
import type { RelicStatKey } from '../relic-score/stat-registry.js';

export type PlayerRelicScoreUnavailableReason =
  | 'profile-unavailable'
  | 'recommendation-unavailable'
  | 'benchmark-unavailable'
  | 'incomplete-build'
  | 'piece-unavailable'
  | 'panel-unavailable'
  | 'score-unavailable';

export interface PlayerRelicEffectiveHits {
  status: 'exact' | 'partial' | 'unavailable';
  known: number;
  unknownRecommendedSubstats: number;
  total: number | null;
}

export type PlayerRelicPieceScore =
  | {
      status: 'available';
      score: number;
      mainCompletion: number;
      benchmarkPercentile: number;
      rawSubUtility: number;
      effectiveHits: PlayerRelicEffectiveHits;
    }
  | { status: 'unavailable'; reason: PlayerRelicScoreUnavailableReason };

export type PlayerRelicBuildScore =
  | {
      status: 'available';
      score: number;
      coreScore: number;
      statCompletion: number;
      setIntegrity: number;
      effectiveHits: PlayerRelicEffectiveHits;
      softTarget: {
        progress: number;
        details: Array<{
          stat: RelicStatKey;
          currentValue: number;
          minimumThreshold: number;
          maximumThreshold: number;
          progress: number;
        }>;
      };
      hardBreakpoint: {
        failureRatio: number;
        details: Array<{
          stat: RelicStatKey;
          currentValue: number;
          threshold: number;
          passed: boolean;
        }>;
      };
    }
  | { status: 'unavailable'; reason: PlayerRelicScoreUnavailableReason };

export interface PlayerRelicScorePresentation {
  version: 1;
  build: PlayerRelicBuildScore;
  pieces: Partial<Record<RelicSlot, PlayerRelicPieceScore>>;
}
