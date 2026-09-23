import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playerRuntimeData } from '../../api/_player/enka/pipeline';
import type { PlayerRuntimeData } from '../../src/lib/player/runtime-data';
import {
  farmingBudget,
  generateFarmingExperiment
} from '../../src/lib/relic-score/farming/farming-contract';
import { generateNaturalRelic } from '../../src/lib/relic-score/farming/generate-natural-relic';
import {
  compileProbabilityModel,
  type ProbabilityModelConfig
} from '../../src/lib/relic-score/farming/probability-model';
import { createSeededRng, PRNG_VERSION } from '../../src/lib/relic-score/farming/prng';

const config = JSON.parse(
  readFileSync('data/relic-score/probability-model.json', 'utf8')
) as ProbabilityModelConfig;
const compiled = compileProbabilityModel(config, playerRuntimeData);
const change = (mutate: (model: ProbabilityModelConfig) => void): ProbabilityModelConfig => {
  const copy = structuredClone(config);
  mutate(copy);
  return copy;
};

describe('independent farming probability model', () => {
  it('closes over current upstream main/sub affixes and validates provenance', () => {
    expect(compiled.substats).toHaveLength(12);
    expect(compiled.mainBySlot.HEAD).toEqual([
      { key: 'HPDelta', probability: 1, value: expect.any(Number) }
    ]);
    expect(compiled.mainBySlot.HAND[0].key).toBe('AttackDelta');
    expect(compiled.mainBySlot.NECK).toHaveLength(10);
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.mainStatProbabilities.BODY[0].probability = 0.21;
        }),
        playerRuntimeData
      )
    ).toThrow('probability total');
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.mainStatProbabilities.BODY[0].stat = 'SpeedDelta';
        }),
        playerRuntimeData
      )
    ).toThrow('illegal main');
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.substatSelectionWeights.pop();
        }),
        playerRuntimeData
      )
    ).toThrow('closure mismatch');
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.substatSelectionWeights[1].stat = model.substatSelectionWeights[0].stat;
        }),
        playerRuntimeData
      )
    ).toThrow('duplicate sub weight');
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.substatSelectionWeights[0].weight = Number.NaN;
        }),
        playerRuntimeData
      )
    ).toThrow('finite and positive');
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.metadata.initialSubstatModel.class = 'upstream-derived';
        }),
        playerRuntimeData
      )
    ).toThrow('provenance');
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.initialSubstatModel.fourProbability = 0.3;
        }),
        playerRuntimeData
      )
    ).toThrow('initial probability total');
    expect(() =>
      compileProbabilityModel(
        change((model) => {
          model.rollGradeModel.policy = 'fixed' as never;
        }),
        playerRuntimeData
      )
    ).toThrow('grade policy');
  });

  it('uses a known, reproducible uint32 PRNG sequence', () => {
    expect(PRNG_VERSION).toBe('mulberry32-v1');
    const sequence = (seed: number) => {
      const rng = createSeededRng(seed);
      return Array.from({ length: 5 }, () => rng.next());
    };
    expect(sequence(123456789)).toEqual([
      0.2577907438389957, 0.9707721115555614, 0.7853280142880976, 0.20616457983851433,
      0.30307188746519387
    ]);
    expect(sequence(123456789)).toEqual(sequence(123456789));
    expect(sequence(123456789)).not.toEqual(sequence(123456790));
    expect(() => createSeededRng(-1)).toThrow('uint32');
  });

  it('generates only natural legal +15 pieces with upstream numeric values', () => {
    const first = generateFarmingExperiment(
      'BODY',
      farmingBudget(40),
      compiled,
      createSeededRng(78)
    );
    expect(first).toEqual(
      generateFarmingExperiment('BODY', farmingBudget(40), compiled, createSeededRng(78))
    );
    expect(first).not.toEqual(
      generateFarmingExperiment('BODY', farmingBudget(40), compiled, createSeededRng(79))
    );
    for (const piece of first) {
      expect(piece.rarity).toBe(5);
      expect(piece.level).toBe(15);
      expect(compiled.mainBySlot.BODY.some((item) => item.key === piece.mainStat.key)).toBe(true);
      expect(piece.mainStat.value).toBe(
        compiled.mainBySlot.BODY.find((item) => item.key === piece.mainStat.key)!.value
      );
      expect(piece.substats).toHaveLength(4);
      expect(new Set(piece.substats.map((sub) => sub.key)).size).toBe(4);
      expect(piece.substats.some((sub) => sub.key === piece.mainStat.key)).toBe(false);
      expect(piece.substats.reduce((sum, sub) => sum + sub.occurrenceCount, 0)).toBe(
        piece.initialSubstatCount === 3 ? 8 : 9
      );
      for (const sub of piece.substats) {
        const affix = compiled.subByKey[sub.key]!.affix;
        expect(sub.cumulativeStep).toBeGreaterThanOrEqual(0);
        expect(sub.cumulativeStep).toBeLessThanOrEqual(sub.occurrenceCount * affix.stepNum!);
        expect(sub.value).toBeCloseTo(
          affix.baseValue * sub.occurrenceCount + affix.stepValue! * sub.cumulativeStep,
          10
        );
      }
      expect(piece).not.toHaveProperty('setId');
      expect(piece).not.toHaveProperty('relicId');
    }
    expect(() => farmingBudget(0)).toThrow('positive');
  });

  it('reveals on +3 for three initial and strengthens from +3 for four initial', () => {
    const four = generateNaturalRelic('HEAD', compiled, { next: () => 0 });
    expect(four.initialSubstatCount).toBe(4);
    expect(four.substats.reduce((sum, sub) => sum + sub.occurrenceCount, 0)).toBe(9);
    expect(four.substats.every((sub) => sub.cumulativeStep === 0)).toBe(true);
    const three = generateNaturalRelic('HEAD', compiled, { next: () => 0.999999 });
    expect(three.initialSubstatCount).toBe(3);
    expect(three.substats.reduce((sum, sub) => sum + sub.occurrenceCount, 0)).toBe(8);
    expect(
      three.substats.every(
        (sub) =>
          sub.cumulativeStep === sub.occurrenceCount * compiled.subByKey[sub.key]!.affix.stepNum!
      )
    ).toBe(true);
  });

  it('takes grade bounds from runtime StepNum instead of a fixed three-grade list', () => {
    const runtime = structuredClone(playerRuntimeData) as PlayerRuntimeData;
    runtime.relicSubAffixes['5:7'].stepNum = 3;
    const model = compileProbabilityModel(config, runtime);
    const draws = [0, 0, 0.999999];
    const piece = generateNaturalRelic('HEAD', model, {
      next: () => draws.shift() ?? 0
    });
    const speed = piece.substats.find((sub) => sub.key === 'SpeedDelta')!;
    expect(speed.occurrenceCount).toBe(6);
    expect(speed.cumulativeStep).toBe(3);
    expect(speed.value).toBeCloseTo(
      runtime.relicSubAffixes['5:7'].baseValue * speed.occurrenceCount +
        3 * runtime.relicSubAffixes['5:7'].stepValue!,
      10
    );
  });

  it('matches broad main, initial and weighted first-sub frequencies', () => {
    const count = 40_000;
    const rng = createSeededRng(501);
    const mains = new Map<string, number>();
    const firstSubs = new Map<string, number>();
    const secondGivenFirstHp = new Map<string, number>();
    let fourInitial = 0;
    let totalGrades = 0;
    let totalRolls = 0;
    for (let index = 0; index < count; index++) {
      const piece = generateNaturalRelic('BODY', compiled, rng);
      mains.set(piece.mainStat.key, (mains.get(piece.mainStat.key) ?? 0) + 1);
      firstSubs.set(piece.substats[0].key, (firstSubs.get(piece.substats[0].key) ?? 0) + 1);
      if (piece.substats[0].key === 'HPDelta')
        secondGivenFirstHp.set(
          piece.substats[1].key,
          (secondGivenFirstHp.get(piece.substats[1].key) ?? 0) + 1
        );
      if (piece.initialSubstatCount === 4) fourInitial++;
      for (const sub of piece.substats) {
        totalGrades += sub.cumulativeStep;
        totalRolls += sub.occurrenceCount;
      }
    }
    for (const { key, probability } of compiled.mainBySlot.BODY)
      expect(Math.abs((mains.get(key) ?? 0) / count - probability)).toBeLessThan(0.012);
    expect(Math.abs(fourInitial / count - config.initialSubstatModel.fourProbability)).toBeLessThan(
      0.012
    );
    expect(Math.abs(totalGrades / totalRolls - 1)).toBeLessThan(0.025);
    const ratio = firstSubs.get('HPDelta')! / firstSubs.get('SpeedDelta')!;
    expect(ratio).toBeGreaterThan(2.1);
    expect(ratio).toBeLessThan(2.9);
    const secondRatio =
      secondGivenFirstHp.get('AttackDelta')! / secondGivenFirstHp.get('SpeedDelta')!;
    expect(secondRatio).toBeGreaterThan(2.0);
    expect(secondRatio).toBeLessThan(3.0);
    const fixed = createSeededRng(9);
    for (let index = 0; index < 1000; index++) {
      expect(generateNaturalRelic('HEAD', compiled, fixed).mainStat.key).toBe('HPDelta');
      expect(generateNaturalRelic('HAND', compiled, fixed).mainStat.key).toBe('AttackDelta');
    }
  });

  it('keeps farming core isolated from provider/UI/random global and reforge APIs', () => {
    const files = readdirSync('src/lib/relic-score/farming').filter((name) => name.endsWith('.ts'));
    const source = files
      .map((name) => readFileSync(`src/lib/relic-score/farming/${name}`, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /api\/_player\/enka|HSR-Relic-Simulator-Cross-Platform|Math\.random\(/
    );
    expect(source).not.toMatch(/(?:from|import\s*\()[^\n]*(?:ui|components|\.svelte)/i);
    expect(source).not.toMatch(/reforge|blockedStat|earlyStop/i);
    const normalization = readFileSync('src/lib/relic-score/normalize.ts', 'utf8');
    expect(normalization).not.toMatch(/(?:from|import\s*\()[^\n]*farming/i);
    expect(config).not.toHaveProperty('BaseValue');
  });
});
