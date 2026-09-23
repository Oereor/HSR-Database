import type { AvatarEquipmentRecommendation, RelicSlot } from '../domain/types.js';
import type { PlayerStatTarget } from '../player/property-semantics.js';
import { lookupBenchmarkPercentile } from './benchmark/lookup.js';
import { validateBenchmarkArtifact, type BenchmarkExpectedIdentity } from './benchmark/validate.js';
import type { BenchmarkArtifact } from './benchmark/types.js';
import type { CharacterRelicScoreProfile, ProfileTarget } from './profile-types.js';
import type { RelicScoreReferenceData } from './reference.js';
import { RELIC_SCORE_CONFIG, RELIC_SLOTS } from './scoring-config.js';
import type { RelicStatKey } from './stat-registry.js';
import type { NormalizedRelicPiece, PlayerBuildInput } from './types.js';

export type ScoreUnavailableReason =
  | 'PROFILE_MISSING_OR_UNREVIEWED'
  | 'RECOMMENDATION_MISSING'
  | 'BENCHMARK_MISSING_OR_STALE'
  | 'PIECE_INVALID'
  | 'BUILD_INCOMPLETE'
  | 'PANEL_MISSING'
  | 'TARGET_CONTEXT_MISSING';
export type ScoreResult<T> =
  | { status: 'available'; value: T }
  | { status: 'unavailable' | 'invalid'; reason: ScoreUnavailableReason };

export interface ScoringSources {
  profile?: CharacterRelicScoreProfile;
  recommendation?: AvatarEquipmentRecommendation;
  reference: RelicScoreReferenceData;
  benchmark?: BenchmarkArtifact;
  benchmarkExpected?: BenchmarkExpectedIdentity;
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
  recommendation: AvatarEquipmentRecommendation
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
  try {
    validateBenchmarkArtifact(benchmark, benchmarkExpected);
  } catch {
    return { status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE' };
  }
  const distribution = benchmark.distributions[characterId]?.[piece.slot];
  if (
    !distribution ||
    distribution.identityDigest !== benchmarkExpected.distributions[characterId]?.[piece.slot]
  )
    return { status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE' };
  const benchmarkPercentile = lookupBenchmarkPercentile(distribution, rawSubUtility);
  const pieceNormalized =
    RELIC_SCORE_CONFIG.piece.mainShare * mainCompletion +
    RELIC_SCORE_CONFIG.piece.subShare * benchmarkPercentile;
  return {
    status: 'available',
    value: {
      slot: piece.slot,
      mainCompletion,
      rawSubUtility,
      benchmarkPercentile,
      pieceNormalized,
      pieceScore: 100 * pieceNormalized,
      substats,
      effectiveHits: calculateEffectiveHits(piece, recommendation),
      benchmarkIdentity: distribution.identityDigest
    }
  };
}

export interface TargetContribution {
  slot: RelicSlot;
  panelDelta: number;
}
export interface BuildTargetEntry {
  stat: RelicStatKey;
  panelTarget: PlayerStatTarget;
  baseline: number;
  contributions: TargetContribution[];
}
export interface BuildTargetContext {
  targets: BuildTargetEntry[];
}

export interface TargetExplanation {
  stat: RelicStatKey;
  panelTarget: PlayerStatTarget;
  baseline: number;
  panelValue: number;
  target: number;
  baseWeight: number;
  postTargetWeight: number;
  baseUtility: number;
  targetAwareUtility: number;
  efficiency: number;
}

/** Target only changes complete-build utility; the Piece CDF input remains base-weight. */
export function evaluateTarget(
  target: ProfileTarget,
  context: BuildTargetEntry,
  panelValue: number,
  pieces: readonly PieceScoreValue[],
  profile: CharacterRelicScoreProfile
): TargetExplanation {
  if (
    target.stat !== context.stat ||
    target.panelTarget !== context.panelTarget ||
    !validNumber(context.baseline) ||
    !validNumber(panelValue) ||
    context.contributions.some((part) => !validNumber(part.panelDelta)) ||
    Math.abs(
      context.baseline +
        context.contributions.reduce((sum, part) => sum + part.panelDelta, 0) -
        panelValue
    ) >
      1e-5 * Math.max(1, panelValue)
  )
    throw new Error('[relic-score] invalid target context');
  const baseWeight = profile.substatWeights[target.stat] ?? 0;
  const baseUtility = pieces.reduce(
    (sum, piece) =>
      sum +
      piece.substats
        .filter((sub) => sub.stat === target.stat)
        .reduce((acc, sub) => acc + sub.weightedContribution, 0),
    0
  );
  const delta = context.contributions.reduce((sum, part) => sum + part.panelDelta, 0);
  const before = Math.min(delta, Math.max(0, target.value - context.baseline));
  const utilityRatio =
    delta > 0 && baseWeight > 0
      ? (baseWeight * before + target.postTargetWeight * (delta - before)) / (baseWeight * delta)
      : 1;
  return {
    stat: target.stat,
    panelTarget: target.panelTarget,
    baseline: context.baseline,
    panelValue,
    target: target.value,
    baseWeight,
    postTargetWeight: target.postTargetWeight,
    baseUtility,
    targetAwareUtility: baseUtility * utilityRatio,
    efficiency: clamp(utilityRatio)
  };
}

export interface BreakpointExplanation {
  stat: RelicStatKey;
  currentPanelValue: number;
  target: number;
  passed: boolean;
  weight: number;
}
export function evaluateBreakpoints(
  profile: CharacterRelicScoreProfile,
  panel: PlayerBuildInput['panel']
): ScoreResult<{ score: number; entries: BreakpointExplanation[] }> {
  const count = profile.hardBreakpoints.length;
  const entries: BreakpointExplanation[] = [];
  for (const breakpoint of profile.hardBreakpoints) {
    const value = panel[breakpoint.panelTarget];
    if (value === undefined || !Number.isFinite(value))
      return { status: 'unavailable', reason: 'PANEL_MISSING' };
    entries.push({
      stat: breakpoint.stat,
      currentPanelValue: value,
      target: breakpoint.value,
      passed: value >= breakpoint.value,
      weight: 1 / count
    });
  }
  return {
    status: 'available',
    value: { score: count ? entries.filter((entry) => entry.passed).length / count : 1, entries }
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
  recommendation: AvatarEquipmentRecommendation
): SetIntegrity {
  const cavern = pieces.filter((piece) => ['HEAD', 'HAND', 'BODY', 'FOOT'].includes(piece.slot));
  const planar = pieces.filter((piece) => ['NECK', 'OBJECT'].includes(piece.slot));
  const count = (part: readonly NormalizedRelicPiece[], id: string) =>
    part.filter((piece) => piece.setId === id).length;
  const cavernScores = recommendation.cavernSetIds.map((id) => ({
    id,
    score: count(cavern, id) >= 4 ? 1 : count(cavern, id) >= 2 ? 0.5 : 0
  }));
  const planarScores = recommendation.planarSetIds.map((id) => ({
    id,
    score: count(planar, id) >= 2 ? 1 : 0
  }));
  const bestCavern = cavernScores.reduce((best, item) => (item.score > best.score ? item : best), {
    id: '',
    score: 0
  });
  const bestPlanar = planarScores.reduce((best, item) => (item.score > best.score ? item : best), {
    id: '',
    score: 0
  });
  return {
    cavern: bestCavern.score,
    planar: bestPlanar.score,
    total:
      RELIC_SCORE_CONFIG.sets.cavernShare * bestCavern.score +
      RELIC_SCORE_CONFIG.sets.planarShare * bestPlanar.score,
    matchedCavernSetId: bestCavern.score ? bestCavern.id : null,
    matchedPlanarSetId: bestPlanar.score ? bestPlanar.id : null
  };
}

export interface BuildScoreValue {
  pieces: PieceScoreValue[];
  statCompletion: {
    base: number;
    targetA: number | null;
    targetB: number | null;
    aggregatedMainPart: number;
    aggregatedSubPart: number;
  };
  breakpointScore: number;
  breakpoints: BreakpointExplanation[];
  setIntegrity: SetIntegrity;
  targets: TargetExplanation[];
  finalBaseScore: number;
  finalTargetA: number | null;
  finalTargetB: number | null;
  effectiveHits: EffectiveHits;
}

export interface BuildScoreResult {
  status: 'available' | 'unavailable' | 'invalid';
  reason?: ScoreUnavailableReason;
  pieces: Array<ScoreResult<PieceScoreValue>>;
  build?: BuildScoreValue;
}

export function scoreBuild(
  input: PlayerBuildInput,
  sources: ScoringSources,
  targetContext?: BuildTargetContext
): BuildScoreResult {
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
  if (profile.statTargets.length && !targetContext)
    return { status: 'unavailable', reason: 'TARGET_CONTEXT_MISSING', pieces };
  const sets = evaluateSetIntegrity(input.relics, recommendation);
  const targets: TargetExplanation[] = [];
  if (profile.statTargets.length && targetContext) {
    for (const target of profile.statTargets) {
      const context = targetContext.targets.find((item) => item.stat === target.stat);
      const panel = input.panel[target.panelTarget];
      if (!context) return { status: 'unavailable', reason: 'TARGET_CONTEXT_MISSING', pieces };
      if (panel === undefined) return { status: 'unavailable', reason: 'PANEL_MISSING', pieces };
      try {
        targets.push(evaluateTarget(target, context, panel, available, profile));
      } catch {
        return { status: 'invalid', reason: 'TARGET_CONTEXT_MISSING', pieces };
      }
    }
  }
  const baseUtility = available.reduce((sum, piece) => sum + piece.rawSubUtility, 0);
  const lostUtility = targets.reduce(
    (sum, target) => sum + target.baseUtility - target.targetAwareUtility,
    0
  );
  const efficiency = baseUtility > 0 ? clamp(1 - lostUtility / baseUtility) : 1;
  const targetA = !profile.statTargets.length || targetContext ? main + sub * efficiency : null;
  // Candidate B replaces only the build's substat share with a monotone
  // target-aware absolute credit. Piece scores and main completion stay intact.
  const medianReference = RELIC_SLOTS.reduce(
    (sum, slot) =>
      sum + (sources.benchmark?.distributions[input.characterId]?.[slot]?.summary.p50 ?? 0),
    0
  );
  const awareUtility = Math.max(0, baseUtility - lostUtility);
  const targetCredit =
    medianReference > 0
      ? RELIC_SCORE_CONFIG.piece.subShare * clamp(awareUtility / medianReference)
      : 0;
  const targetB = !profile.statTargets.length
    ? base
    : targetContext && medianReference > 0
      ? main + targetCredit
      : null;
  const final = (stat: number) =>
    100 *
    (RELIC_SCORE_CONFIG.build.statShare * stat +
      RELIC_SCORE_CONFIG.build.breakpointShare * breakpoint.value.score +
      RELIC_SCORE_CONFIG.build.setShare * sets.total);
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
      statCompletion: { base, targetA, targetB, aggregatedMainPart: main, aggregatedSubPart: sub },
      breakpointScore: breakpoint.value.score,
      breakpoints: breakpoint.value.entries,
      setIntegrity: sets,
      targets,
      finalBaseScore: final(base),
      finalTargetA: targetA === null ? null : final(targetA),
      finalTargetB: targetB === null ? null : final(targetB),
      effectiveHits: {
        status: hits.unknown ? (hits.known ? 'partial' : 'unavailable') : 'exact',
        known: hits.known,
        unknownRecommendedSubstats: hits.unknown,
        total: hits.unknown ? null : hits.known
      }
    }
  };
}
