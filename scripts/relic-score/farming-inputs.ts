import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import type { PlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import { assertPlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import type { CharacterRelicScoreProfile } from '../../src/lib/relic-score/profile-types.js';
import type { RelicStatKey } from '../../src/lib/relic-score/stat-registry.js';
import { NATURAL_GENERATOR_VERSION } from '../../src/lib/relic-score/farming/generate-natural-relic.js';
import { QUANTILE_REPRESENTATION_VERSION } from '../../src/lib/relic-score/farming/dense-quantile.js';
import type { FarmingBudget } from '../../src/lib/relic-score/farming/farming-contract.js';
import {
  compileProbabilityModel,
  type CompiledProbabilityModel,
  type ProbabilityModelConfig
} from '../../src/lib/relic-score/farming/probability-model.js';
import type { CandidateLens } from '../../src/lib/relic-score/farming/prototype.js';
import { PRNG_VERSION } from '../../src/lib/relic-score/farming/prng.js';
import type { AvatarEquipmentRecommendation } from '../../src/lib/domain/types.js';
import { generatedRoot, siteRoot } from '../data/paths.js';
import { stableSerialize } from './profiles.js';

const modelPath = path.join(siteRoot, 'data/relic-score/probability-model.json');

export function probabilityModelDigest(config: ProbabilityModelConfig): string {
  return createHash('sha256').update(stableSerialize(config)).digest('hex');
}

export async function loadFarmingInputs(): Promise<{
  runtime: PlayerRuntimeData;
  model: CompiledProbabilityModel;
}> {
  const [rawRuntime, rawModel] = await Promise.all([
    readFile(path.join(generatedRoot, 'runtime/player.json'), 'utf8'),
    readFile(modelPath, 'utf8')
  ]);
  const runtime: unknown = JSON.parse(rawRuntime);
  assertPlayerRuntimeData(runtime);
  return { runtime, model: compileProbabilityModel(JSON.parse(rawModel), runtime) };
}

export interface BenchmarkIdentityInput {
  characterId: string;
  slot: RelicSlot;
  profile: CharacterRelicScoreProfile;
  recommendation: AvatarEquipmentRecommendation;
  model: CompiledProbabilityModel;
  budget: FarmingBudget;
  experimentCount: number;
  seed: number;
  lens: CandidateLens;
  quantilePoints: 257 | 513;
}

/** Contract-only identity; no formal benchmark artifact is emitted in Phase 1B. */
export function benchmarkIdentityDigest(input: BenchmarkIdentityInput): string {
  const { profile, recommendation, model, slot } = input;
  if (profile.characterId !== input.characterId || recommendation.avatarId !== input.characterId)
    throw new Error('[relic-score/farming] benchmark character mismatch');
  const mainOption = recommendation.mainStatOptions.find((option) => option.slot === slot);
  const recommendedMains: RelicStatKey[] =
    slot === 'HEAD' || slot === 'HAND'
      ? [model.mainBySlot[slot][0].key]
      : ((mainOption?.propertyTypes as RelicStatKey[] | undefined) ?? []);
  if (!recommendedMains.length)
    throw new Error('[relic-score/farming] missing main recommendation');
  const payload = {
    benchmarkSchemaVersion: 1,
    characterId: input.characterId,
    slot,
    profile: {
      substatWeights: profile.substatWeights
    },
    recommendedMains,
    probabilityModel: model.config,
    reference: {
      mainAt15: model.mainBySlot[slot].map(({ key, value }) => ({ key, value })),
      subAffixes: model.substats.map(({ key, affix, highRoll }) => ({
        key,
        baseValue: affix.baseValue,
        stepValue: affix.stepValue,
        stepNum: affix.stepNum,
        highRoll
      }))
    },
    budget: input.budget,
    experimentCount: input.experimentCount,
    prngVersion: PRNG_VERSION,
    seed: input.seed,
    generatorVersion: NATURAL_GENERATOR_VERSION,
    candidateSelectionMode: input.lens,
    quantileRepresentationVersion: QUANTILE_REPRESENTATION_VERSION,
    quantilePoints: input.quantilePoints
  };
  return createHash('sha256').update(stableSerialize(payload)).digest('hex');
}
