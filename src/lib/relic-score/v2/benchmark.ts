import type { RelicSlot } from '../../domain/types.js';
import type { CompiledProbabilityModel } from '../farming/probability-model.js';
import type { BenchmarkDistribution } from '../benchmark/types.js';
import {
  benchmarkSha256,
  fiveStarReferenceDigest,
  probabilityModelDigest,
  stableBenchmarkSerialize
} from '../benchmark/identity.js';
import {
  NATURAL_GENERATOR_VERSION,
  PRNG_VERSION,
  QUANTILE_REPRESENTATION_VERSION
} from '../benchmark/versions.js';
import { RELIC_SLOTS } from '../scoring-config.js';
import {
  SUB_MAPPING_VERSION,
  UTILITY_VERSION,
  type RatingV2Profile,
  type RatingV2Profiles
} from './profile.js';
import type { RelicStatKey } from '../stat-registry.js';

export const RATING_V2_BENCHMARK_CONFIG = {
  budgetN: 1,
  experimentCount: 65_536,
  seed: 123_456_789,
  quantilePoints: 257,
  selectionMode: 'single-base-raw-sub-utility',
  maxRepresentationError: 0.005,
  seedContract: 'same-seed-reset-per-distribution-v1'
} as const;
export function ratingV2SubDigest(profile: RatingV2Profile): string {
  return benchmarkSha256({
    characterId: profile.characterId,
    effectiveSubWeights: profile.effectiveSubWeights,
    subMappingVersion: SUB_MAPPING_VERSION,
    utilityVersion: UTILITY_VERSION
  });
}
export interface RatingV2Benchmark {
  schemaVersion: 4;
  algorithmVersion: 2;
  sourceCommit: string;
  metadata: {
    prototype: boolean;
    budgetN: number;
    experimentCount: number;
    seed: number;
    quantilePoints: 257;
    samplingDigest: string;
    profileDigests: Record<string, string>;
  };
  distributions: Record<
    string,
    Partial<Record<RelicSlot, Partial<Record<RelicStatKey, BenchmarkDistribution>>>>
  >;
}
export function ratingV2ExpectedBenchmark(
  model: CompiledProbabilityModel,
  profiles: readonly RatingV2Profile[]
) {
  const samplingDigest = benchmarkSha256({
    schemaVersion: 4,
    ...RATING_V2_BENCHMARK_CONFIG,
    probabilityDigest: probabilityModelDigest(model.config),
    referenceDigest: fiveStarReferenceDigest(model),
    naturalGeneratorVersion: NATURAL_GENERATOR_VERSION,
    prngVersion: PRNG_VERSION,
    quantileRepresentationVersion: QUANTILE_REPRESENTATION_VERSION
  });
  const profileDigests = Object.fromEntries(
    profiles.map((profile) => [profile.characterId, ratingV2SubDigest(profile)])
  );
  const cases = profiles.flatMap((profile) =>
    RELIC_SLOTS.flatMap((slot) =>
      model.mainBySlot[slot].map(({ key }) => ({
        characterId: profile.characterId,
        slot,
        mainStatKey: key,
        identityDigest: benchmarkSha256({
          samplingDigest,
          profileDigest: profileDigests[profile.characterId],
          slot,
          mainStatKey: key
        })
      }))
    )
  );
  const identities = Object.fromEntries(
    cases.map((item) => [
      `${item.characterId}:${item.slot}:${item.mainStatKey}`,
      item.identityDigest
    ])
  );
  return { samplingDigest, profileDigests, cases, identities };
}
export type RatingV2ExpectedBenchmark = ReturnType<typeof ratingV2ExpectedBenchmark>;

/** A blocked character prevents full publication, not candidate engineering. */
export function assertRatingV2PublicationReady(
  profiles: RatingV2Profiles,
  expectedCommit: string
): void {
  if (profiles.sourceCommit !== expectedCommit)
    throw new Error('Rating V2 source differs from upstream lock');
  const blockers = profiles.profiles.filter((profile) => profile.status !== 'ready');
  if (blockers.length)
    throw new Error(
      `Rating V2 review blockers: ${blockers.map((profile) => profile.characterId).join(',')}`
    );
}
export function validateRatingV2Benchmark(
  artifact: RatingV2Benchmark,
  expected: RatingV2ExpectedBenchmark,
  sourceCommit: string,
  requireProduction = false
): void {
  const config = RATING_V2_BENCHMARK_CONFIG;
  if (
    artifact.schemaVersion !== 4 ||
    artifact.algorithmVersion !== 2 ||
    !/^[a-f0-9]{40}$/.test(artifact.sourceCommit) ||
    !/^[a-f0-9]{40}$/.test(sourceCommit) ||
    typeof artifact.metadata?.prototype !== 'boolean' ||
    (requireProduction && artifact.metadata.prototype) ||
    artifact.metadata.budgetN !== config.budgetN ||
    artifact.metadata.experimentCount !== config.experimentCount ||
    artifact.metadata.seed !== config.seed ||
    artifact.metadata.quantilePoints !== config.quantilePoints ||
    artifact.metadata.samplingDigest !== expected.samplingDigest ||
    stableBenchmarkSerialize(artifact.metadata.profileDigests) !==
      stableBenchmarkSerialize(expected.profileDigests)
  )
    throw new Error('Missing/stale Rating V2 benchmark');
  const actual = Object.entries(artifact.distributions)
    .flatMap(([characterId, slots]) =>
      Object.entries(slots).flatMap(([slot, mains]) =>
        Object.keys(mains!).map((main) => `${characterId}:${slot}:${main}`)
      )
    )
    .sort();
  const required = expected.cases
    .map((item) => `${item.characterId}:${item.slot}:${item.mainStatKey}`)
    .sort();
  if (stableBenchmarkSerialize(actual) !== stableBenchmarkSerialize(required))
    throw new Error('Rating V2 benchmark coverage mismatch');
  for (const item of expected.cases) {
    const distribution = artifact.distributions[item.characterId]?.[item.slot]?.[item.mainStatKey];
    if (
      !distribution ||
      distribution.identityDigest !== item.identityDigest ||
      distribution.quantiles.length !== config.quantilePoints ||
      distribution.quantiles.some(
        (value, index, values) =>
          !Number.isFinite(value) || value < 0 || (index > 0 && value < values[index - 1])
      ) ||
      Object.values(distribution.summary).some((value) => !Number.isFinite(value) || value < 0)
    )
      throw new Error(
        `Invalid Rating V2 distribution ${item.characterId}:${item.slot}:${item.mainStatKey}`
      );
  }
}
