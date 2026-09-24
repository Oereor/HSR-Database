import { createHash } from 'node:crypto';
import type { AvatarEquipmentRecommendation, RelicSlot } from '../../domain/types.js';
import type { CharacterRelicScoreProfile } from '../profile-types.js';
import type {
  CompiledProbabilityModel,
  ProbabilityModelConfig
} from '../farming/probability-model.js';
import type { FarmingBudget } from '../farming/farming-contract.js';
import {
  NATURAL_GENERATOR_VERSION,
  PRNG_VERSION,
  QUANTILE_REPRESENTATION_VERSION
} from './versions.js';
import type { CandidateLens } from '../farming/prototype.js';
import { RELIC_SLOTS } from '../scoring-config.js';
import {
  BENCHMARK_GENERATOR_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_SEED_CONTRACT
} from './types.js';
import type { BenchmarkExpectedIdentity } from './validate.js';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, stableValue(item)])
    );
  return value;
}

export function stableBenchmarkSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function benchmarkSha256(value: unknown): string {
  return createHash('sha256').update(stableBenchmarkSerialize(value)).digest('hex');
}

/** Provenance text is validated by the model compiler but does not affect sampling. */
export function probabilityModelDigest(config: ProbabilityModelConfig): string {
  return benchmarkSha256({
    schemaVersion: config.schemaVersion,
    modelVersion: config.modelVersion,
    mainStatProbabilities: config.mainStatProbabilities,
    substatSelectionWeights: config.substatSelectionWeights,
    initialSubstatModel: config.initialSubstatModel,
    rollGradeModel: config.rollGradeModel,
    enhancementModel: config.enhancementModel
  });
}

export function profileScoringDigest(profile: CharacterRelicScoreProfile): string {
  return benchmarkSha256({
    characterId: profile.characterId,
    substatWeights: profile.substatWeights
  });
}

function slotReference(model: CompiledProbabilityModel, slot: RelicSlot) {
  return {
    main: model.mainBySlot[slot].map(({ key, value }) => ({ key, value })),
    sub: model.substats.map(({ key, affix, highRoll }) => ({
      key,
      baseValue: affix.baseValue,
      stepValue: affix.stepValue,
      stepNum: affix.stepNum,
      highRoll
    }))
  };
}

export function fiveStarReferenceDigest(model: CompiledProbabilityModel): string {
  return benchmarkSha256(
    Object.fromEntries(RELIC_SLOTS.map((slot) => [slot, slotReference(model, slot)]))
  );
}

export interface BenchmarkIdentityInput {
  characterId: string;
  slot: RelicSlot;
  profile: CharacterRelicScoreProfile;
  recommendation?: AvatarEquipmentRecommendation;
  model: CompiledProbabilityModel;
  budget: FarmingBudget;
  experimentCount: number;
  seed: number;
  lens: CandidateLens;
  quantilePoints: 257 | 513;
}

/** A/B do not select by recommended main; C does. Each distribution restarts the same seed. */
export function benchmarkIdentityDigest(input: BenchmarkIdentityInput): string {
  const { profile, model, slot } = input;
  if (profile.characterId !== input.characterId)
    throw new Error('[relic-score/benchmark] character mismatch');
  let recommendedMains: string[] | undefined;
  if (input.lens === 'C') {
    if (input.recommendation?.avatarId !== input.characterId)
      throw new Error('[relic-score/benchmark] Lens C recommendation required');
    recommendedMains =
      slot === 'HEAD' || slot === 'HAND'
        ? [model.mainBySlot[slot][0].key]
        : (input.recommendation.mainStatOptions.find((option) => option.slot === slot)
            ?.propertyTypes ?? []);
    if (!recommendedMains.length)
      throw new Error('[relic-score/benchmark] missing Lens C main recommendation');
  }
  return benchmarkSha256({
    benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
    benchmarkGeneratorVersion: BENCHMARK_GENERATOR_VERSION,
    characterId: input.characterId,
    slot,
    profileWeightDigest: profileScoringDigest(profile),
    ...(recommendedMains ? { recommendedMains } : {}),
    probabilityModelDigest: probabilityModelDigest(model.config),
    reference: slotReference(model, slot),
    budget: input.budget,
    experimentCount: input.experimentCount,
    prngVersion: PRNG_VERSION,
    seed: input.seed,
    seedContract: BENCHMARK_SEED_CONTRACT,
    naturalGeneratorVersion: NATURAL_GENERATOR_VERSION,
    lens: input.lens,
    quantileRepresentationVersion: QUANTILE_REPRESENTATION_VERSION,
    quantilePoints: input.quantilePoints
  });
}

export interface ExpectedBenchmarkInputs {
  model: CompiledProbabilityModel;
  profiles: readonly CharacterRelicScoreProfile[];
  recommendations?: readonly AvatarEquipmentRecommendation[];
}

export function buildExpectedBenchmarkIdentity(
  inputs: ExpectedBenchmarkInputs,
  options: {
    N: number;
    K: number;
    seed: number;
    cases: readonly { characterId: string; slot: RelicSlot }[];
    lens: CandidateLens;
    quantilePoints: 257 | 513;
    allowPrototype?: boolean;
    requireCompleteCoverage?: boolean;
  }
): BenchmarkExpectedIdentity {
  const profiles = new Map(inputs.profiles.map((profile) => [profile.characterId, profile]));
  const recommendations = new Map(
    inputs.recommendations?.map((recommendation) => [recommendation.avatarId, recommendation]) ?? []
  );
  const profileDigests: Record<string, string> = {};
  const distributions: BenchmarkExpectedIdentity['distributions'] = {};
  for (const { characterId, slot } of options.cases) {
    const profile = profiles.get(characterId);
    if (
      !profile ||
      profile.metadata.reviewStatus !== 'reviewed' ||
      profile.metadata.inputDigest !== profile.metadata.reviewedInputDigest ||
      !RELIC_SLOTS.includes(slot)
    )
      throw new Error(`[relic-score/benchmark] reviewed inputs required: ${characterId}:${slot}`);
    profileDigests[characterId] = profileScoringDigest(profile);
    (distributions[characterId] ??= {})[slot] = benchmarkIdentityDigest({
      characterId,
      slot,
      profile,
      recommendation: recommendations.get(characterId),
      model: inputs.model,
      budget: {
        unit: 'target-slot-natural-piece',
        pieceCount: options.N,
        rarity: 5,
        enhancementLevel: 15,
        enhanceAll: true
      },
      experimentCount: options.K,
      seed: options.seed,
      lens: options.lens,
      quantilePoints: options.quantilePoints
    });
  }
  return {
    budgetN: options.N,
    experimentCount: options.K,
    seed: options.seed,
    farmingModelVersion: inputs.model.config.modelVersion,
    profileDigests,
    probabilityDigest: probabilityModelDigest(inputs.model.config),
    referenceDigest: fiveStarReferenceDigest(inputs.model),
    distributions,
    requireCompleteCoverage: options.requireCompleteCoverage,
    allowPrototype: options.allowPrototype
  };
}
