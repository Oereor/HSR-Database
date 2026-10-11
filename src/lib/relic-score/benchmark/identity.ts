import { createHash } from 'node:crypto';
import type { RelicSlot } from '../../domain/types.js';
import type {
  CompiledProbabilityModel,
  ProbabilityModelConfig
} from '../farming/probability-model.js';
import { RELIC_SLOTS } from '../scoring-config.js';
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
