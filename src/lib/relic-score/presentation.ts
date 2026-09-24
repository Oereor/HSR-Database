import type { RelicSlot } from '../domain/types.js';
import type {
  PlayerRelicScorePresentation,
  PlayerRelicScoreUnavailableReason
} from '../player/relic-score-contract.js';
import type { BuildScoreResult, ScoreUnavailableReason } from './score.js';
import type { NormalizationReason, PlayerBuildNormalization } from './types.js';

function scoreReason(reason?: ScoreUnavailableReason): PlayerRelicScoreUnavailableReason {
  switch (reason) {
    case 'PROFILE_MISSING_OR_UNREVIEWED':
      return 'profile-unavailable';
    case 'RECOMMENDATION_MISSING':
      return 'recommendation-unavailable';
    case 'BENCHMARK_MISSING_OR_STALE':
      return 'benchmark-unavailable';
    case 'BUILD_INCOMPLETE':
      return 'incomplete-build';
    case 'PANEL_MISSING':
      return 'panel-unavailable';
    case 'PIECE_INVALID':
      return 'piece-unavailable';
    default:
      return 'score-unavailable';
  }
}

function normalizationReason(reason: NormalizationReason): PlayerRelicScoreUnavailableReason {
  if (reason === 'MISSING_SLOT') return 'incomplete-build';
  if (reason === 'MISSING_PANEL_STAT' || reason === 'NONFINITE_VALUE') return 'panel-unavailable';
  if (reason === 'SYNTHESIS_FAILED') return 'score-unavailable';
  return 'piece-unavailable';
}

export function unavailableRelicScore(
  reason: PlayerRelicScoreUnavailableReason,
  slots: readonly RelicSlot[] = []
): PlayerRelicScorePresentation {
  return {
    version: 1,
    build: { status: 'unavailable', reason },
    pieces: Object.fromEntries(slots.map((slot) => [slot, { status: 'unavailable', reason }]))
  };
}

/** Drops benchmark, profile and per-stat scorer internals before serialization. */
export function presentRelicScoreResult(
  normalized: PlayerBuildNormalization,
  result: BuildScoreResult
): PlayerRelicScorePresentation {
  const input = normalized.status === 'valid' ? normalized.input : normalized.partialInput;
  const pieces: PlayerRelicScorePresentation['pieces'] = {};
  for (const [index, relic] of (input?.relics ?? []).entries()) {
    const scored = result.pieces[index];
    pieces[relic.slot] =
      scored?.status === 'available'
        ? {
            status: 'available',
            score: scored.value.pieceScore,
            mainCompletion: scored.value.mainCompletion,
            benchmarkPercentile: scored.value.benchmarkPercentile,
            rawSubUtility: scored.value.rawSubUtility,
            effectiveHits: scored.value.effectiveHits
          }
        : { status: 'unavailable', reason: scoreReason(scored?.reason ?? result.reason) };
  }
  if (normalized.status !== 'valid')
    for (const slot of Object.keys(normalized.pieceFailures ?? {}) as RelicSlot[])
      pieces[slot] = { status: 'unavailable', reason: 'piece-unavailable' };

  const build =
    result.status === 'available' && result.build && normalized.status === 'valid'
      ? {
          status: 'available' as const,
          score: result.build.finalBuildScore,
          coreScore: result.build.coreBuildScore,
          statCompletion: result.build.statCompletion.base,
          setIntegrity: result.build.setIntegrity.total,
          effectiveHits: result.build.effectiveHits,
          softTarget: {
            progress: result.build.softTargetProgress,
            details: result.build.softTargets.map((entry) => ({
              stat: entry.stat,
              currentValue: entry.panelValue,
              minimumThreshold: entry.minimumThreshold,
              maximumThreshold: entry.maximumThreshold,
              progress: entry.progress
            }))
          },
          hardBreakpoint: {
            failureRatio: result.build.hardBreakpointFailureRatio,
            details: result.build.hardBreakpoints.map((entry) => ({
              stat: entry.stat,
              currentValue: entry.currentPanelValue,
              threshold: entry.threshold,
              passed: entry.passed
            }))
          }
        }
      : {
          status: 'unavailable' as const,
          reason:
            normalized.status === 'valid'
              ? scoreReason(result.reason)
              : normalizationReason(normalized.reason)
        };
  return { version: 1, build, pieces };
}
