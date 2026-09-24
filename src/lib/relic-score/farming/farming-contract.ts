import type { RelicSlot } from '../../domain/types.js';
import { generateNaturalRelic, type GeneratedNaturalRelic } from './generate-natural-relic.js';
import type { CompiledProbabilityModel } from './probability-model.js';
import type { SeededRng } from './prng.js';

export interface FarmingBudget {
  unit: 'target-slot-natural-piece';
  pieceCount: number;
  rarity: 5;
  enhancementLevel: 15;
  enhanceAll: true;
}

export function farmingBudget(pieceCount: number): FarmingBudget {
  if (!Number.isSafeInteger(pieceCount) || pieceCount <= 0)
    throw new Error('[relic-score/farming] N must be a positive safe integer');
  return {
    unit: 'target-slot-natural-piece',
    pieceCount,
    rarity: 5,
    enhancementLevel: 15,
    enhanceAll: true
  };
}

export function generateFarmingExperiment(
  slot: RelicSlot,
  budget: FarmingBudget,
  model: CompiledProbabilityModel,
  rng: SeededRng
): GeneratedNaturalRelic[] {
  if (
    budget.unit !== 'target-slot-natural-piece' ||
    budget.rarity !== 5 ||
    budget.enhancementLevel !== 15 ||
    budget.enhanceAll !== true
  )
    throw new Error('[relic-score/farming] unsupported farming budget');
  farmingBudget(budget.pieceCount);
  return Array.from({ length: budget.pieceCount }, () => generateNaturalRelic(slot, model, rng));
}
