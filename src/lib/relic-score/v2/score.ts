import type { RelicSlot } from '../../domain/types.js';
import { lookupDenseCdf } from '../benchmark/cdf.js';
import type { RelicScoreReferenceData } from '../reference.js';
import { RELIC_SLOTS, RELIC_SCORE_CONFIG } from '../scoring-config.js';
import {
  calculateEffectiveHits,
  evaluateSetIntegrity,
  type EffectiveHits,
  type SetIntegrity
} from '../score.js';
import { isRelicStatKey, relicStatSemantics } from '../stat-registry.js';
import type { NormalizedRelicPiece } from '../types.js';
import { subUtilityTerm, ratingV2RawSubUtility } from './utility.js';
import type { RatingV2Profile } from './profile.js';
import type { RatingV2BuildInput } from './normalize.js';
import {
  ratingV2SubDigest,
  validateRatingV2Benchmark,
  type RatingV2Benchmark,
  type RatingV2ExpectedBenchmark
} from './benchmark.js';

export const RATING_V2_ALPHA = 0.35;
export type RatingV2Reason =
  | 'profile-unavailable'
  | 'profile-review-required'
  | 'main-weight-unavailable'
  | 'benchmark-unavailable'
  | 'piece-unavailable'
  | 'incomplete-build';
export type RatingV2Result<T> =
  { status: 'available'; value: T } | { status: 'unavailable'; reason: RatingV2Reason };
export interface RatingV2Piece {
  slot: RelicSlot;
  score: number;
  mainMode: 'fixed' | 'continuous' | 'explicit-agnostic';
  mainSuitability: number | null;
  mainCompletion: number | null;
  mainContribution: number;
  subContribution: number;
  benchmarkPercentile: number;
  rawSubUtility: number;
  effectiveHits: EffectiveHits;
  substats: Array<{
    key: NormalizedRelicPiece['mainStat']['key'];
    weight: number;
    rollEq: number;
    utility: number;
    effectiveHit: number | null;
  }>;
}
export interface RatingV2Build {
  score: number;
  statCompletion: number;
  mainContribution: number;
  subContribution: number;
  setIntegrity: SetIntegrity;
  effectiveHits: EffectiveHits;
}
export interface RatingV2Sources {
  profile?: RatingV2Profile;
  reference: RelicScoreReferenceData;
  benchmark?: RatingV2Benchmark;
  expected: RatingV2ExpectedBenchmark;
  sourceCommit: string;
  /** Set only by the server/maintenance caller after complete artifact validation. */
  benchmarkValidated?: true;
}
const clamp = (value: number) => Math.min(1, Math.max(0, value));
export function ratingV2Contributions(
  mode: RatingV2Piece['mainMode'],
  suitability: number | null,
  completion: number | null,
  percentile: number,
  alpha = RATING_V2_ALPHA
) {
  if (
    ![percentile, alpha].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) ||
    (mode === 'continuous' &&
      ![suitability, completion].every(
        (value) => value !== null && Number.isFinite(value) && value >= 0 && value <= 1
      ))
  )
    throw new Error('Invalid Rating V2 contribution input');
  const mainContribution = mode === 'continuous' ? alpha * suitability! * completion! : 0;
  const subContribution = (mode === 'continuous' ? 1 - alpha : 1) * percentile;
  return {
    mainContribution,
    subContribution,
    score: 100 * clamp(mainContribution + subContribution)
  };
}
export function scoreRatingV2Piece(
  piece: NormalizedRelicPiece,
  characterId: string,
  sources: RatingV2Sources,
  alpha = RATING_V2_ALPHA
): RatingV2Result<RatingV2Piece> {
  const unavailable = (reason: RatingV2Reason): RatingV2Result<RatingV2Piece> => ({
    status: 'unavailable',
    reason
  });
  const profile = sources.profile;
  if (!profile || profile.characterId !== characterId) return unavailable('profile-unavailable');
  if (profile.status !== 'ready' || profile.anomalies.length)
    return unavailable('profile-review-required');
  if (
    !RELIC_SLOTS.includes(piece.slot) ||
    !isRelicStatKey(piece.mainStat.key) ||
    !relicStatSemantics(piece.mainStat.key).mainSlots.includes(piece.slot) ||
    !Number.isFinite(piece.mainStat.value) ||
    piece.mainStat.value <= 0 ||
    !Number.isSafeInteger(piece.rarity) ||
    piece.rarity < 1 ||
    piece.rarity > 5 ||
    !Number.isSafeInteger(piece.level) ||
    piece.level < 0 ||
    piece.level > piece.rarity * 3 ||
    piece.substats.length > 4 ||
    new Set(piece.substats.map((sub) => sub.key)).size !== piece.substats.length ||
    piece.substats.some(
      (sub) =>
        !isRelicStatKey(sub.key) ||
        !relicStatSemantics(sub.key).canBeSubstat ||
        sub.key === piece.mainStat.key ||
        !Number.isFinite(sub.value) ||
        sub.value <= 0 ||
        !Number.isSafeInteger(sub.occurrenceCount) ||
        sub.occurrenceCount < 1 ||
        !Number.isSafeInteger(sub.cumulativeStep) ||
        sub.cumulativeStep < 0
    )
  )
    return unavailable('piece-unavailable');
  const reference = sources.reference.mainAt15[piece.slot]?.[piece.mainStat.key];
  if (!reference || !Number.isFinite(reference) || reference <= 0)
    return unavailable('piece-unavailable');
  const slot = profile.slots[piece.slot];
  const state = profile.mainWeights[piece.mainStat.key];
  if (
    slot.mode === 'continuous' &&
    (!state || !(slot.maximum! > 0) || !Number.isFinite(slot.maximum))
  )
    return unavailable('main-weight-unavailable');
  if (!sources.benchmark) return unavailable('benchmark-unavailable');
  try {
    if (!sources.benchmarkValidated)
      validateRatingV2Benchmark(sources.benchmark, sources.expected, sources.sourceCommit);
  } catch {
    return unavailable('benchmark-unavailable');
  }
  const distribution =
    sources.benchmark.distributions[characterId]?.[piece.slot]?.[piece.mainStat.key];
  if (
    !distribution ||
    sources.benchmark.metadata.samplingDigest !== sources.expected.samplingDigest ||
    ratingV2SubDigest(profile) !== sources.expected.profileDigests[characterId] ||
    sources.benchmark.metadata.profileDigests[characterId] !==
      sources.expected.profileDigests[characterId] ||
    distribution.identityDigest !==
      sources.expected.identities[`${characterId}:${piece.slot}:${piece.mainStat.key}`]
  )
    return unavailable('benchmark-unavailable');
  try {
    const weights = profile.effectiveSubWeights;
    const highRoll = (key: NormalizedRelicPiece['mainStat']['key']) =>
      sources.reference.subHighRoll[key]!;
    const rawSubUtility = ratingV2RawSubUtility(piece.substats, weights, highRoll);
    const percentile = lookupDenseCdf(distribution.quantiles, rawSubUtility);
    const mainSuitability =
      slot.mode === 'continuous' ? clamp(state!.weight / slot.maximum!) : null;
    const mainCompletion =
      slot.mode === 'continuous' ? clamp(piece.mainStat.value / reference) : null;
    const recommended = new Set(profile.recommendation.subStatPropertyTypes);
    return {
      status: 'available',
      value: {
        slot: piece.slot,
        mainMode: slot.mode,
        mainSuitability,
        mainCompletion,
        ...ratingV2Contributions(slot.mode, mainSuitability, mainCompletion, percentile, alpha),
        benchmarkPercentile: percentile,
        rawSubUtility,
        effectiveHits: calculateEffectiveHits(piece, profile.recommendation),
        substats: piece.substats.map((sub) => ({
          key: sub.key,
          weight: weights[sub.key] ?? 0,
          rollEq: sub.value / highRoll(sub.key),
          utility: subUtilityTerm(sub.value, highRoll(sub.key), weights[sub.key] ?? 0),
          effectiveHit: recommended.has(sub.key)
            ? sub.rollCount.status === 'exact'
              ? sub.rollCount.count
              : null
            : 0
        }))
      }
    };
  } catch {
    return unavailable('piece-unavailable');
  }
}
export function scoreRatingV2Build(
  input: RatingV2BuildInput,
  sources: RatingV2Sources,
  alpha = RATING_V2_ALPHA
) {
  const pieces = input.relics.map((piece) =>
    scoreRatingV2Piece(piece, input.characterId, sources, alpha)
  );
  const slots = new Set(input.relics.map((piece) => piece.slot));
  let build: RatingV2Result<RatingV2Build>;
  if (slots.size !== input.relics.length)
    build = { status: 'unavailable', reason: 'piece-unavailable' };
  else if (RELIC_SLOTS.some((slot) => !slots.has(slot)))
    build = { status: 'unavailable', reason: 'incomplete-build' };
  else if (pieces.some((piece) => piece.status !== 'available'))
    build = pieces.find((piece) => piece.status !== 'available') as Extract<
      typeof build,
      { status: 'unavailable' }
    >;
  else {
    const available = pieces.map(
      (piece) => (piece as Extract<typeof piece, { status: 'available' }>).value
    );
    const weighted = (key: 'mainContribution' | 'subContribution') =>
      available.reduce((sum, piece) => sum + RELIC_SCORE_CONFIG.slots[piece.slot] * piece[key], 0);
    const mainContribution = weighted('mainContribution');
    const subContribution = weighted('subContribution');
    const statCompletion = clamp(mainContribution + subContribution);
    const setIntegrity = evaluateSetIntegrity(input.relics, sources.profile!.recommendation);
    const known = available.reduce((sum, piece) => sum + piece.effectiveHits.known, 0);
    const unknown = available.reduce(
      (sum, piece) => sum + piece.effectiveHits.unknownRecommendedSubstats,
      0
    );
    build = {
      status: 'available',
      value: {
        score: 100 * clamp(0.95 * statCompletion + 0.05 * setIntegrity.total),
        statCompletion,
        mainContribution,
        subContribution,
        setIntegrity,
        effectiveHits: {
          status: unknown ? (known ? 'partial' : 'unavailable') : 'exact',
          known,
          unknownRecommendedSubstats: unknown,
          total: unknown ? null : known
        }
      }
    };
  }
  return { build, pieces };
}
