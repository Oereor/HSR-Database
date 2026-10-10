import type { CanonicalPlayerCharacterBuild } from '../../player/canonical.js';
import type { PlayerRuntimeData } from '../../player/runtime-data.js';
import { assertPlayerRuntimeData } from '../../player/runtime-data.js';
import { buildRelicScoreReferenceData } from '../../relic-score/reference.js';
import { compileProbabilityModel } from '../../relic-score/farming/probability-model.js';
import {
  validateRatingV2Profile,
  MAIN_MAPPING_VERSION,
  SUB_MAPPING_VERSION,
  UTILITY_VERSION,
  type RatingV2Profiles
} from '../../relic-score/v2/profile.js';
import { benchmarkSha256 } from '../../relic-score/benchmark/identity.js';
import {
  assertRatingV2PublicationReady,
  ratingV2ExpectedBenchmark,
  validateRatingV2Benchmark,
  type RatingV2Benchmark
} from '../../relic-score/v2/benchmark.js';
import { normalizeRatingV2Build } from '../../relic-score/v2/normalize.js';
import { scoreRatingV2Build } from '../../relic-score/v2/score.js';
import { presentRatingV2 } from '../../relic-score/v2/presentation.js';

/** Explicit candidate entry. Never loads a V1 benchmark or falls back to V1. */
export function createRatingV2Scorer(
  profiles: RatingV2Profiles,
  benchmark: RatingV2Benchmark,
  runtime: PlayerRuntimeData,
  probability: unknown,
  mode: 'candidate' | 'production' = 'candidate'
) {
  assertPlayerRuntimeData(runtime);
  if (
    profiles.schemaVersion !== 5 ||
    profiles.algorithmVersion !== 2 ||
    !/^[a-f0-9]{40}$/.test(profiles.sourceCommit) ||
    profiles.mainMappingVersion !== MAIN_MAPPING_VERSION ||
    profiles.subMappingVersion !== SUB_MAPPING_VERSION ||
    profiles.utilityVersion !== UTILITY_VERSION ||
    benchmarkSha256(profiles.profiles) !== profiles.semanticDigest ||
    new Set(profiles.profiles.map((profile) => profile.characterId)).size !==
      profiles.profiles.length
  )
    throw new Error('Invalid Rating V2 profile schema');
  profiles.profiles.forEach(validateRatingV2Profile);
  if (mode === 'production') {
    assertRatingV2PublicationReady(profiles, profiles.sourceCommit);
    if (
      profiles.profiles
        .map((profile) => profile.characterId)
        .sort()
        .join() !== Object.keys(runtime.avatarPromotions).sort().join()
    )
      throw new Error('Rating V2 production closure mismatch');
  }
  const model = compileProbabilityModel(probability, runtime);
  const expected = ratingV2ExpectedBenchmark(model, profiles.profiles);
  validateRatingV2Benchmark(benchmark, expected, profiles.sourceCommit, mode === 'production');
  const reference = buildRelicScoreReferenceData(runtime);
  const byId = new Map(profiles.profiles.map((profile) => [profile.characterId, profile]));
  return (build: CanonicalPlayerCharacterBuild) => {
    const normalized = normalizeRatingV2Build(build, runtime);
    const input = normalized.status === 'valid' ? normalized.input : normalized.partialInput;
    return {
      normalized,
      score: presentRatingV2(
        normalized,
        scoreRatingV2Build(input, {
          profile: byId.get(build.avatarId),
          reference,
          benchmark,
          expected,
          sourceCommit: profiles.sourceCommit,
          benchmarkValidated: true
        })
      )
    };
  };
}
