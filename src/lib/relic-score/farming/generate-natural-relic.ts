import type { RelicSlot } from '../../domain/types.js';
import { playerSubAffixValue } from '../../player/runtime-data.js';
import type { RelicStatKey } from '../stat-registry.js';
import type {
  CompiledMainStat,
  CompiledProbabilityModel,
  CompiledSubstat
} from './probability-model.js';
import type { SeededRng } from './prng.js';

export { NATURAL_GENERATOR_VERSION } from '../benchmark/versions.js';

export interface GeneratedNaturalRelic {
  slot: RelicSlot;
  rarity: 5;
  level: 15;
  mainStat: { key: RelicStatKey; value: number };
  substats: Array<{
    key: RelicStatKey;
    occurrenceCount: number;
    cumulativeStep: number;
    value: number;
  }>;
  initialSubstatCount: 3 | 4;
}

interface MutableSubstat {
  entry: CompiledSubstat;
  occurrenceCount: number;
  cumulativeStep: number;
}

function drawWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: SeededRng): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let ticket = rng.next() * total;
  for (const item of items) {
    ticket -= weight(item);
    if (ticket < 0) return item;
  }
  return items[items.length - 1];
}

function grade(entry: CompiledSubstat, rng: SeededRng): number {
  return Math.floor(rng.next() * (entry.affix.stepNum! + 1));
}

/** Generates one natural target-slot 5-star relic, enhancing every result to +15. */
export function generateNaturalRelic(
  slot: RelicSlot,
  model: CompiledProbabilityModel,
  rng: SeededRng,
  mainStatKey?: RelicStatKey
): GeneratedNaturalRelic {
  const mains = model.mainBySlot[slot];
  if (!mains?.length) throw new Error(`[relic-score/farming] invalid slot ${slot}`);
  const fixedMain =
    mainStatKey === undefined ? undefined : mains.find((entry) => entry.key === mainStatKey);
  if (mainStatKey !== undefined && !fixedMain)
    throw new Error(`[relic-score/farming] illegal main ${slot}:${mainStatKey}`);
  const main: CompiledMainStat =
    fixedMain ??
    (mains.length === 1 ? mains[0] : drawWeighted(mains, (entry) => entry.probability, rng));
  const initialSubstatCount: 3 | 4 =
    rng.next() < model.config.initialSubstatModel.fourProbability ? 4 : 3;
  const available = model.substats.filter((entry) => entry.key !== main.key);
  const substats: MutableSubstat[] = [];
  const reveal = (): void => {
    const entry = drawWeighted(available, (candidate) => candidate.weight, rng);
    available.splice(available.indexOf(entry), 1);
    substats.push({ entry, occurrenceCount: 1, cumulativeStep: grade(entry, rng) });
  };
  for (let i = 0; i < initialSubstatCount; i++) reveal();
  for (const node of model.config.enhancementModel.nodes) {
    if (initialSubstatCount === 3 && node === 3) {
      reveal();
      continue;
    }
    const chosen = substats[Math.floor(rng.next() * substats.length)];
    chosen.occurrenceCount++;
    chosen.cumulativeStep += grade(chosen.entry, rng);
  }
  return {
    slot,
    rarity: 5,
    level: model.config.enhancementModel.maxLevel,
    mainStat: { key: main.key, value: main.value },
    substats: substats.map(({ entry, occurrenceCount, cumulativeStep }) => ({
      key: entry.key,
      occurrenceCount,
      cumulativeStep,
      value: playerSubAffixValue(entry.affix, occurrenceCount, cumulativeStep)
    })),
    initialSubstatCount
  };
}
