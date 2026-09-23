import { createHash } from 'node:crypto';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import type { AvatarEquipmentRecommendation } from '../../src/lib/domain/types.js';
import type { CharacterRelicScoreProfile } from '../../src/lib/relic-score/profile-types.js';
import type { CompiledProbabilityModel } from '../../src/lib/relic-score/farming/probability-model.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import type { PlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import { RELIC_SLOTS } from '../../src/lib/relic-score/scoring-config.js';
import {
  BENCHMARK_QUANTILE_POINTS,
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_SELECTION_MODE,
  BENCHMARK_VERSION,
  type BenchmarkArtifact,
  type BenchmarkDistribution
} from '../../src/lib/relic-score/benchmark/types.js';
import type { BenchmarkExpectedIdentity } from '../../src/lib/relic-score/benchmark/validate.js';
import {
  encodeDenseQuantiles,
  measureQuantileError,
  QUANTILE_REPRESENTATION_VERSION
} from '../../src/lib/relic-score/farming/dense-quantile.js';
import {
  farmingBudget,
  generateFarmingExperiment
} from '../../src/lib/relic-score/farming/farming-contract.js';
import { NATURAL_GENERATOR_VERSION } from '../../src/lib/relic-score/farming/generate-natural-relic.js';
import { rawSubUtility, empiricalQuantile } from '../../src/lib/relic-score/farming/prototype.js';
import { createSeededRng, PRNG_VERSION } from '../../src/lib/relic-score/farming/prng.js';
import { benchmarkIdentityDigest, probabilityModelDigest } from './farming-inputs.js';
import { stableSerialize } from './profiles.js';

export const sha256 = (value: unknown): string =>
  createHash('sha256').update(stableSerialize(value)).digest('hex');

/** Fit and verification samples are separate, avoiding an in-sample 1/256 error ceiling. */
export function evaluateQuantileGate(
  trainingSorted: readonly number[],
  verificationSorted: readonly number[]
) {
  const error257 = measureQuantileError(
    verificationSorted,
    encodeDenseQuantiles(trainingSorted, 257)
  );
  const pass257 = error257.maxAbsoluteCdfError <= 0.005;
  return {
    pass257,
    error257,
    error513: pass257
      ? null
      : measureQuantileError(verificationSorted, encodeDenseQuantiles(trainingSorted, 513))
  };
}
export function profileScoringDigest(profile: CharacterRelicScoreProfile): string {
  return sha256({
    characterId: profile.characterId,
    substatWeights: profile.substatWeights,
    hardBreakpoints: profile.hardBreakpoints,
    statTargets: profile.statTargets,
    statCurves: profile.statCurves
  });
}

export interface BenchmarkInputs {
  runtime: PlayerRuntimeData;
  model: CompiledProbabilityModel;
  profiles: CharacterRelicScoreProfile[];
  recommendations: AvatarEquipmentRecommendation[];
}
export interface BenchmarkOptions {
  N: number;
  K: number;
  seed: number;
  cases: Array<{ characterId: string; slot: RelicSlot }>;
  prototype: true;
}

export function expectedBenchmarkIdentity(
  inputs: BenchmarkInputs,
  options: BenchmarkOptions
): BenchmarkExpectedIdentity {
  const profiles = new Map(inputs.profiles.map((profile) => [profile.characterId, profile]));
  const recommendations = new Map(
    inputs.recommendations.map((recommendation) => [recommendation.avatarId, recommendation])
  );
  const profileDigests: Record<string, string> = {};
  const distributions: BenchmarkExpectedIdentity['distributions'] = {};
  for (const { characterId, slot } of options.cases) {
    const profile = profiles.get(characterId);
    const recommendation = recommendations.get(characterId);
    if (
      !profile ||
      !recommendation ||
      profile.metadata.reviewStatus !== 'reviewed' ||
      profile.metadata.inputDigest !== profile.metadata.reviewedInputDigest
    )
      throw new Error(`[relic-score/benchmark] reviewed inputs required: ${characterId}`);
    profileDigests[characterId] = profileScoringDigest(profile);
    (distributions[characterId] ??= {})[slot] = benchmarkIdentityDigest({
      characterId,
      slot,
      profile,
      recommendation,
      model: inputs.model,
      budget: farmingBudget(options.N),
      experimentCount: options.K,
      seed: options.seed,
      lens: 'B',
      quantilePoints: 257
    });
  }
  return {
    budgetN: options.N,
    experimentCount: options.K,
    seed: options.seed,
    farmingModelVersion: inputs.model.config.modelVersion,
    profileDigests,
    probabilityDigest: probabilityModelDigest(inputs.model.config),
    referenceDigest: sha256(buildRelicScoreReferenceData(inputs.runtime)),
    distributions,
    allowPrototype: options.prototype
  };
}

export interface GeneratedCase {
  characterId: string;
  slot: RelicSlot;
  samples: number[];
  distribution: BenchmarkDistribution;
  runtimeMs: number;
  error257: ReturnType<typeof measureQuantileError>;
  error513?: ReturnType<typeof measureQuantileError>;
}
export function generateBenchmarkCases(
  inputs: BenchmarkInputs,
  options: BenchmarkOptions
): { artifact: BenchmarkArtifact; expected: BenchmarkExpectedIdentity; cases: GeneratedCase[] } {
  const expected = expectedBenchmarkIdentity(inputs, options);
  const profiles = new Map(inputs.profiles.map((profile) => [profile.characterId, profile]));
  const cases: GeneratedCase[] = [];
  const distributions: BenchmarkArtifact['distributions'] = {};
  for (const { characterId, slot } of options.cases) {
    if (!RELIC_SLOTS.includes(slot))
      throw new Error(`[relic-score/benchmark] invalid slot ${slot}`);
    const profile = profiles.get(characterId)!;
    const rng = createSeededRng(options.seed);
    const budget = farmingBudget(options.N);
    const samples: number[] = [];
    const start = performance.now();
    for (let experiment = 0; experiment < options.K; experiment++) {
      let best = -Infinity;
      for (const piece of generateFarmingExperiment(slot, budget, inputs.model, rng))
        best = Math.max(best, rawSubUtility(piece, profile, inputs.model));
      samples.push(best);
    }
    const runtimeMs = performance.now() - start;
    samples.sort((a, b) => a - b);
    const quantiles = encodeDenseQuantiles(samples, BENCHMARK_QUANTILE_POINTS);
    const error257 = measureQuantileError(samples, quantiles);
    const error513 =
      error257.maxAbsoluteCdfError > 0.005
        ? measureQuantileError(samples, encodeDenseQuantiles(samples, 513))
        : undefined;
    const distribution: BenchmarkDistribution = {
      identityDigest: expected.distributions[characterId]![slot]!,
      summary: {
        mean: samples.reduce((a, b) => a + b, 0) / samples.length,
        p25: empiricalQuantile(samples, 0.25),
        p50: empiricalQuantile(samples, 0.5),
        p75: empiricalQuantile(samples, 0.75),
        p90: empiricalQuantile(samples, 0.9),
        p95: empiricalQuantile(samples, 0.95),
        p99: empiricalQuantile(samples, 0.99)
      },
      quantiles
    };
    (distributions[characterId] ??= {})[slot] = distribution;
    cases.push({
      characterId,
      slot,
      samples,
      distribution,
      runtimeMs,
      error257,
      ...(error513 ? { error513 } : {})
    });
  }
  const artifact: BenchmarkArtifact = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    benchmarkVersion: BENCHMARK_VERSION,
    metadata: {
      prototype: true,
      farmingModelVersion: expected.farmingModelVersion,
      generatorVersion: NATURAL_GENERATOR_VERSION,
      prngVersion: PRNG_VERSION,
      seed: options.seed,
      budgetN: options.N,
      experimentCount: options.K,
      selectionMode: BENCHMARK_SELECTION_MODE,
      quantileRepresentationVersion: QUANTILE_REPRESENTATION_VERSION,
      quantilePoints: BENCHMARK_QUANTILE_POINTS,
      profileDigests: expected.profileDigests,
      probabilityDigest: expected.probabilityDigest,
      referenceDigest: expected.referenceDigest
    },
    distributions
  };
  return { artifact, expected, cases };
}
