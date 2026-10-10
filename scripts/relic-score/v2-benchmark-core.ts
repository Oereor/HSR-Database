import type { CompiledProbabilityModel } from '../../src/lib/relic-score/farming/probability-model.js';
import {
  farmingBudget,
  generateFarmingExperiment
} from '../../src/lib/relic-score/farming/farming-contract.js';
import { createSeededRng } from '../../src/lib/relic-score/farming/prng.js';
import {
  encodeDenseQuantiles,
  measureQuantileError
} from '../../src/lib/relic-score/farming/dense-quantile.js';
import { empiricalQuantile } from '../../src/lib/relic-score/farming/quantile.js';
import { ratingV2RawSubUtility } from '../../src/lib/relic-score/v2/utility.js';
import {
  RATING_V2_BENCHMARK_CONFIG,
  ratingV2ExpectedBenchmark,
  validateRatingV2Benchmark,
  type RatingV2Benchmark
} from '../../src/lib/relic-score/v2/benchmark.js';
import type { RatingV2Profile, RatingV2Profiles } from '../../src/lib/relic-score/v2/profile.js';

export class RatingV2RepresentationError extends Error {
  constructor(
    readonly diagnostic: {
      characterId: string;
      slot: string;
      mainStatKey: string;
      experimentCount: number;
      quantilePoints: 257;
      maxAbsoluteCdfError: number;
      meanAbsoluteCdfError: number;
      maxSampleRankError: number;
      queryCount: number;
    }
  ) {
    super(
      `257-point gate failed ${diagnostic.characterId}:${diagnostic.slot}:${diagnostic.mainStatKey} max=${diagnostic.maxAbsoluteCdfError}; candidate unchanged`
    );
  }
}

export function generateRatingV2Distribution(
  model: CompiledProbabilityModel,
  profile: RatingV2Profile,
  item: ReturnType<typeof ratingV2ExpectedBenchmark>['cases'][number],
  experimentCount = RATING_V2_BENCHMARK_CONFIG.experimentCount as number
) {
  if (profile.status !== 'ready') throw new Error(`Review blocker ${profile.characterId}`);
  const config = RATING_V2_BENCHMARK_CONFIG;
  const rng = createSeededRng(config.seed);
  const samples = Array.from({ length: experimentCount }, () =>
    Math.max(
      ...generateFarmingExperiment(
        item.slot,
        farmingBudget(config.budgetN),
        model,
        rng,
        item.mainStatKey
      ).map((piece) =>
        ratingV2RawSubUtility(
          piece.substats,
          profile.effectiveSubWeights,
          (key) => model.subByKey[key]!.highRoll
        )
      )
    )
  ).sort((a, b) => a - b);
  const quantiles = encodeDenseQuantiles(samples, 257);
  const error = measureQuantileError(samples, quantiles);
  if (error.maxAbsoluteCdfError > config.maxRepresentationError)
    throw new RatingV2RepresentationError({
      characterId: item.characterId,
      slot: item.slot,
      mainStatKey: item.mainStatKey,
      experimentCount,
      quantilePoints: 257,
      ...error
    });
  return {
    distribution: {
      identityDigest: item.identityDigest,
      quantiles,
      summary: {
        mean: samples.reduce((a, b) => a + b, 0) / samples.length,
        p25: empiricalQuantile(samples, 0.25),
        p50: empiricalQuantile(samples, 0.5),
        p75: empiricalQuantile(samples, 0.75),
        p90: empiricalQuantile(samples, 0.9),
        p95: empiricalQuantile(samples, 0.95),
        p99: empiricalQuantile(samples, 0.99)
      }
    },
    error
  };
}
export function generateRatingV2Benchmark(
  model: CompiledProbabilityModel,
  profiles: RatingV2Profiles
) {
  const expected = ratingV2ExpectedBenchmark(model, profiles.profiles);
  const artifact: RatingV2Benchmark = {
    schemaVersion: 4,
    algorithmVersion: 2,
    sourceCommit: profiles.sourceCommit,
    metadata: {
      prototype: false,
      budgetN: 3,
      experimentCount: 65_536,
      seed: 123_456_789,
      quantilePoints: 257,
      samplingDigest: expected.samplingDigest,
      profileDigests: expected.profileDigests
    },
    distributions: {}
  };
  const audit = [];
  const byId = new Map(profiles.profiles.map((profile) => [profile.characterId, profile]));
  for (const [index, item] of expected.cases.entries()) {
    const result = generateRatingV2Distribution(model, byId.get(item.characterId)!, item);
    ((artifact.distributions[item.characterId] ??= {})[item.slot] ??= {})[item.mainStatKey] =
      result.distribution;
    audit.push({ ...item, summary: result.distribution.summary, ...result.error });
    if ((index + 1) % 30 === 0)
      console.log(`[rating-v2] ${index + 1}/${expected.cases.length} generated and gated`);
  }
  validateRatingV2Benchmark(artifact, expected, profiles.sourceCommit, true);
  return { artifact, audit };
}
