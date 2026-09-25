import type { RelicSlot } from '../domain/types.js';
import type { RelicScoreRecommendation } from './recommendations.js';
import { lookupBenchmarkPercentile } from './benchmark/lookup.js';
import { validateBenchmarkArtifact, type BenchmarkExpectedIdentity } from './benchmark/validate.js';
import type { BenchmarkArtifact } from './benchmark/types.js';
import type { CharacterRelicScoreProfile } from './profile-types.js';
import type { RelicScoreReferenceData } from './reference.js';
import { RELIC_SCORE_CONFIG, RELIC_SLOTS } from './scoring-config.js';
import { coreBuildScore, finalBuildScore, pieceNormalized } from './scoring-math.js';
import { relicStatSemantics, type RelicStatKey } from './stat-registry.js';
import type { NormalizedRelicPiece, PlayerBuildInput } from './types.js';

export type ScoreUnavailableReason =
  | 'PROFILE_MISSING_OR_UNREVIEWED'
  | 'RECOMMENDATION_MISSING'
  | 'BENCHMARK_MISSING_OR_STALE'
  | 'PIECE_INVALID'
  | 'BUILD_INCOMPLETE'
  | 'PANEL_MISSING';
export type ScoreResult<T> =
  | { status: 'available'; value: T }
  | { status: 'unavailable' | 'invalid'; reason: ScoreUnavailableReason };

export interface ScoringSources {
  profile?: CharacterRelicScoreProfile;
  recommendation?: RelicScoreRecommendation;
  reference: RelicScoreReferenceData;
  benchmark?: BenchmarkArtifact;
  benchmarkExpected?: BenchmarkExpectedIdentity;
  /** Only the server loader may set this after validating its module-cached artifact. */
  benchmarkValidated?: boolean;
}

export interface SubstatScoreExplanation {
  stat: RelicStatKey;
  actual: number;
  highRollReference: number;
  rollEq: number;
  baseWeight: number;
  weightedContribution: number;
  occurrenceCount: number | null;
  effectiveHit: number | null;
}

export interface EffectiveHits {
  status: 'exact' | 'partial' | 'unavailable';
  known: number;
  unknownRecommendedSubstats: number;
  total: number | null;
}

export interface PieceScoreValue {
  slot: RelicSlot;
  mainCompletion: number;
  rawSubUtility: number;
  benchmarkPercentile: number;
  pieceNormalized: number;
  pieceScore: number;
  substats: SubstatScoreExplanation[];
  effectiveHits: EffectiveHits;
  benchmarkIdentity: string;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const validNumber = (x: number) => Number.isFinite(x) && x >= 0;

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

export function scorePiece(
  piece: NormalizedRelicPiece,
  characterId: string,
  sources: ScoringSources
): ScoreResult<PieceScoreValue> {
  const { profile, recommendation, reference, benchmark, benchmarkExpected } = sources;
  if (
    !profile ||
    profile.characterId !== characterId ||
    profile.metadata.reviewStatus !== 'reviewed' ||
    profile.metadata.inputDigest !== profile.metadata.reviewedInputDigest
  )
    return { status: 'unavailable', reason: 'PROFILE_MISSING_OR_UNREVIEWED' };
  if (!recommendation || recommendation.avatarId !== characterId)
    return { status: 'unavailable', reason: 'RECOMMENDATION_MISSING' };
  if (
    !RELIC_SLOTS.includes(piece.slot) ||
    !validNumber(piece.mainStat.value) ||
    piece.substats.some((sub) => !validNumber(sub.value))
  )
    return { status: 'invalid', reason: 'PIECE_INVALID' };
  const mainReference = reference.mainAt15[piece.slot]?.[piece.mainStat.key];
  const mains =
    piece.slot === 'HEAD' || piece.slot === 'HAND'
      ? new Set(Object.keys(reference.mainAt15[piece.slot]))
      : new Set(
          recommendation.mainStatOptions.find((option) => option.slot === piece.slot)
            ?.propertyTypes ?? []
        );
  const suitability = mains.has(piece.mainStat.key) ? 1 : 0;
  if (!mainReference || !validNumber(mainReference))
    return { status: 'invalid', reason: 'PIECE_INVALID' };
  const mainCompletion = suitability * clamp(piece.mainStat.value / mainReference);
  const recommendedSubstats = new Set(recommendation.subStatPropertyTypes);
  const substats: SubstatScoreExplanation[] = [];
  for (const sub of piece.substats) {
    const highRollReference = reference.subHighRoll[sub.key];
    if (!highRollReference || !validNumber(highRollReference))
      return { status: 'invalid', reason: 'PIECE_INVALID' };
    const rollEq = sub.value / highRollReference;
    const baseWeight = profile.substatWeights[sub.key] ?? 0;
    const exact = sub.rollCount.status === 'exact' ? sub.rollCount.count : null;
    substats.push({
      stat: sub.key,
      actual: sub.value,
      highRollReference,
      rollEq,
      baseWeight,
      weightedContribution: rollEq * baseWeight,
      occurrenceCount: exact,
      effectiveHit: recommendedSubstats.has(sub.key) ? exact : 0
    });
  }
  const rawSubUtility = substats.reduce((sum, sub) => sum + sub.weightedContribution, 0);
  if (!Number.isFinite(rawSubUtility)) return { status: 'invalid', reason: 'PIECE_INVALID' };
  if (!benchmark || !benchmarkExpected)
    return { status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE' };
  if (!sources.benchmarkValidated) {
    try {
      validateBenchmarkArtifact(benchmark, benchmarkExpected);
    } catch {
      return { status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE' };
    }
  }
  const distribution = benchmark.distributions[characterId]?.[piece.slot]?.[piece.mainStat.key];
  if (
    !distribution ||
    distribution.identityDigest !==
      benchmarkExpected.distributions[characterId]?.[piece.slot]?.[piece.mainStat.key]
  )
    return { status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE' };
  const benchmarkPercentile = lookupBenchmarkPercentile(distribution, rawSubUtility);
  const normalized = pieceNormalized(
    mainCompletion,
    benchmarkPercentile,
    RELIC_SCORE_CONFIG.piece.mainShare
  );
  return {
    status: 'available',
    value: {
      slot: piece.slot,
      mainCompletion,
      rawSubUtility,
      benchmarkPercentile,
      pieceNormalized: normalized,
      pieceScore: 100 * normalized,
      substats,
      effectiveHits: calculateEffectiveHits(piece, recommendation),
      benchmarkIdentity: distribution.identityDigest
    }
  };
}

export interface SoftTargetExplanation {
  stat: RelicStatKey;
  panelValue: number;
  minimumThreshold: number;
  maximumThreshold: number;
  progress: number;
}

/** Soft targets only read final OOC panel values; no relic attribution is needed. */
export function evaluateSoftTargets(
  profile: CharacterRelicScoreProfile,
  panel: PlayerBuildInput['panel']
): ScoreResult<{ progress: number; entries: SoftTargetExplanation[] }> {
  const entries: SoftTargetExplanation[] = [];
  for (const target of profile.softTargets) {
    const value = panel[relicStatSemantics(target.stat).panelTarget];
    if (value === undefined || !Number.isFinite(value))
      return { status: 'unavailable', reason: 'PANEL_MISSING' };
    entries.push({
      stat: target.stat,
      panelValue: value,
      minimumThreshold: target.minimumThreshold,
      maximumThreshold: target.maximumThreshold,
      progress: clamp(
        (value - target.minimumThreshold) / (target.maximumThreshold - target.minimumThreshold)
      )
    });
  }
  return {
    status: 'available',
    value: {
      progress: entries.length
        ? entries.reduce((sum, entry) => sum + entry.progress, 0) / entries.length
        : 0,
      entries
    }
  };
}

export interface BreakpointExplanation {
  stat: RelicStatKey;
  currentPanelValue: number;
  threshold: number;
  passed: boolean;
}
export function evaluateBreakpoints(
  profile: CharacterRelicScoreProfile,
  panel: PlayerBuildInput['panel']
): ScoreResult<{ failureRatio: number; entries: BreakpointExplanation[] }> {
  const count = profile.hardBreakpoints.length;
  const entries: BreakpointExplanation[] = [];
  for (const breakpoint of profile.hardBreakpoints) {
    const value = panel[relicStatSemantics(breakpoint.stat).panelTarget];
    if (value === undefined || !Number.isFinite(value))
      return { status: 'unavailable', reason: 'PANEL_MISSING' };
    entries.push({
      stat: breakpoint.stat,
      currentPanelValue: value,
      threshold: breakpoint.threshold,
      passed: value >= breakpoint.threshold
    });
  }
  return {
    status: 'available',
    value: {
      failureRatio: count ? entries.filter((entry) => !entry.passed).length / count : 0,
      entries
    }
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

export interface BuildScoreValue {
  pieces: PieceScoreValue[];
  statCompletion: {
    base: number;
    aggregatedMainPart: number;
    aggregatedSubPart: number;
  };
  softTargetProgress: number;
  softTargets: SoftTargetExplanation[];
  hardBreakpointFailureRatio: number;
  hardBreakpoints: BreakpointExplanation[];
  setIntegrity: SetIntegrity;
  coreBuildScore: number;
  softTargetBonus: number;
  hardBreakpointPenalty: number;
  finalBuildScore: number;
  effectiveHits: EffectiveHits;
}

export interface BuildScoreResult {
  status: 'available' | 'unavailable' | 'invalid';
  reason?: ScoreUnavailableReason;
  pieces: Array<ScoreResult<PieceScoreValue>>;
  build?: BuildScoreValue;
}

export function scoreBuild(input: PlayerBuildInput, sources: ScoringSources): BuildScoreResult {
  const pieces = input.relics.map((piece) => scorePiece(piece, input.characterId, sources));
  const slots = new Set(input.relics.map((piece) => piece.slot));
  if (slots.size !== input.relics.length)
    return { status: 'invalid', reason: 'PIECE_INVALID', pieces };
  if (RELIC_SLOTS.some((slot) => !slots.has(slot)))
    return { status: 'unavailable', reason: 'BUILD_INCOMPLETE', pieces };
  const failed = pieces.find((piece) => piece.status !== 'available');
  if (failed) return { status: failed.status, reason: failed.reason, pieces };
  const profile = sources.profile!;
  const recommendation = sources.recommendation!;
  const available = pieces.map(
    (piece) => (piece as Extract<typeof piece, { status: 'available' }>).value
  );
  const main = available.reduce(
    (sum, piece) =>
      sum +
      RELIC_SCORE_CONFIG.slots[piece.slot] *
        RELIC_SCORE_CONFIG.piece.mainShare *
        piece.mainCompletion,
    0
  );
  const sub = available.reduce(
    (sum, piece) =>
      sum +
      RELIC_SCORE_CONFIG.slots[piece.slot] *
        RELIC_SCORE_CONFIG.piece.subShare *
        piece.benchmarkPercentile,
    0
  );
  const base = main + sub;
  const breakpoint = evaluateBreakpoints(profile, input.panel);
  if (breakpoint.status !== 'available')
    return { status: breakpoint.status, reason: breakpoint.reason, pieces };
  const soft = evaluateSoftTargets(profile, input.panel);
  if (soft.status !== 'available') return { status: soft.status, reason: soft.reason, pieces };
  const sets = evaluateSetIntegrity(input.relics, recommendation);
  const core = coreBuildScore(base, sets.total, RELIC_SCORE_CONFIG.build.statShare);
  const softTargetBonus = RELIC_SCORE_CONFIG.build.maxSoftTargetBonus * soft.value.progress;
  const hardBreakpointPenalty =
    RELIC_SCORE_CONFIG.build.maxBreakpointPenalty * breakpoint.value.failureRatio;
  const finalScore = finalBuildScore(
    core,
    soft.value.progress,
    breakpoint.value.failureRatio,
    RELIC_SCORE_CONFIG.build.maxSoftTargetBonus,
    RELIC_SCORE_CONFIG.build.maxBreakpointPenalty
  );
  const hits = available.reduce(
    (acc, piece) => ({
      known: acc.known + piece.effectiveHits.known,
      unknown: acc.unknown + piece.effectiveHits.unknownRecommendedSubstats
    }),
    { known: 0, unknown: 0 }
  );
  return {
    status: 'available',
    pieces,
    build: {
      pieces: available,
      statCompletion: { base, aggregatedMainPart: main, aggregatedSubPart: sub },
      softTargetProgress: soft.value.progress,
      softTargets: soft.value.entries,
      hardBreakpointFailureRatio: breakpoint.value.failureRatio,
      hardBreakpoints: breakpoint.value.entries,
      setIntegrity: sets,
      coreBuildScore: core,
      softTargetBonus,
      hardBreakpointPenalty,
      finalBuildScore: finalScore,
      effectiveHits: {
        status: hits.unknown ? (hits.known ? 'partial' : 'unavailable') : 'exact',
        known: hits.known,
        unknownRecommendedSubstats: hits.unknown,
        total: hits.unknown ? null : hits.known
      }
    }
  };
}
