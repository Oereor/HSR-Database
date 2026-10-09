import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  convertTrainingExp,
  calculateTrainingExpCosts,
  calculateCharacterTrainingTarget,
  calculateLightConeTrainingTarget,
  createDefaultCharacterTrainingTarget
} from '../../src/lib/domain/training/index';
import type {
  CharacterTrainingData,
  LightConeTrainingData,
  TrainingSharedData
} from '../../src/lib/domain/training/types';

const items = [
  { itemId: '1', exp: 1000 },
  { itemId: '3', exp: 20000 },
  { itemId: '2', exp: 5000 }
];
const json = <T>(path: string): T => JSON.parse(readFileSync(`static/generated/${path}`, 'utf8'));
const shared = json<TrainingSharedData>('training/shared.json');

describe('total EXP greedy strategy', () => {
  it.each([0, 1, 999, 1000, 4999, 5000, 19999, 20000, 5797920])(
    'covers %i EXP with integer items, regardless of input order',
    (exp) => {
      const result = convertTrainingExp(exp, items);
      expect(result).toEqual(convertTrainingExp(exp, [...items].reverse()));
      expect(result.suppliedExp).toBeGreaterThanOrEqual(exp);
      expect(result.overflowExp).toBe(result.suppliedExp - exp);
      expect(
        result.expItems.every((item) => Number.isSafeInteger(item.count) && item.count > 0)
      ).toBe(true);
      expect(result.expItems.reduce((sum, item) => sum + item.exp * item.count, 0)).toBe(
        result.suppliedExp
      );
      if (!exp) expect(result.expItemCost).toEqual({});
    }
  );
  it('uses floor for larger items and ceil only at the smallest item', () => {
    expect(convertTrainingExp(20000, items).expItemCost).toEqual({ '3': 1 });
    expect(convertTrainingExp(25001, items).expItemCost).toEqual({ '3': 1, '2': 1, '1': 1 });
    expect(convertTrainingExp(5797920, items)).toMatchObject({
      suppliedExp: 5798000,
      overflowExp: 80,
      expItemCost: { '3': 289, '2': 3, '1': 3 }
    });
  });
  it('rejects illegal inputs, missing/duplicate configs and unsafe products', () => {
    for (const exp of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => convertTrainingExp(exp, items)).toThrow();
    expect(() => convertTrainingExp(1, [])).toThrow();
    expect(() => convertTrainingExp(1, [...items, items[0]])).toThrow();
    expect(() => convertTrainingExp(1, [{ itemId: '1', exp: 0 }])).toThrow();
    expect(() => convertTrainingExp(Number.MAX_SAFE_INTEGER, [{ itemId: '1', exp: 2 }])).toThrow();
  });
  it('does not guess character rounding and checks light-cone credit products', () => {
    expect(() =>
      calculateTrainingExpCosts('character', { ...shared, characterExpCreditDivisor: 3 }, 1)
    ).toThrow(/non-integer-exp-credit/);
    expect(calculateTrainingExpCosts('character', shared, 0).expCreditCost).toEqual({});
    expect(calculateTrainingExpCosts('light-cone', shared, 0).expCreditCost).toEqual({});
    const synthetic = { ...shared, lightConeExpItems: [{ itemId: '1', exp: 1, creditCost: 7 }] };
    expect(calculateTrainingExpCosts('light-cone', synthetic, 3).expCreditCost).toEqual({
      '2': 21
    });
    expect(() =>
      calculateTrainingExpCosts(
        'light-cone',
        {
          ...synthetic,
          lightConeExpItems: [{ itemId: '1', exp: 1, creditCost: Number.MAX_SAFE_INTEGER }]
        },
        2
      )
    ).toThrow();
  });
  it('adds actual character inputs and credits once without changing configured costs', () => {
    const data = json<CharacterTrainingData>('training/characters/1001.json');
    const result = calculateCharacterTrainingTarget(
      data,
      shared,
      createDefaultCharacterTrainingTarget(data, 0)
    );
    expect(result).toMatchObject({
      requiredExp: 5797920,
      suppliedExp: 5798000,
      overflowExp: 80,
      expItemCost: { '213': 289, '212': 3, '211': 3 },
      expCreditCost: { '2': 579800 }
    });
    expect(result.totalKnownCost['2']).toBe(2646400);
    expect(result.totalCost['2']).toBe(3226200);
    for (const [id, quantity] of Object.entries(result.totalKnownCost))
      if (id !== '2') expect(result.totalCost[id]).toBe(quantity);
    expect(result.precision.expCreditCost).toBe('exact-under-greedy-strategy');
  });
  it.each([
    ['20000', 597440, 597500, 60, 298750, 529750],
    ['21000', 796590, 797000, 410, 398500, 706500],
    ['23000', 995700, 996000, 300, 498000, 883000]
  ])(
    'matches light-cone %s paid item credits including overflow',
    (id, required, supplied, overflow, credits, total) => {
      const data = json<LightConeTrainingData>(`training/light-cones/${id}.json`);
      const result = calculateLightConeTrainingTarget(data, shared, {
        equipmentId: String(id),
        level: 80
      });
      expect(result).toMatchObject({
        requiredExp: required,
        suppliedExp: supplied,
        overflowExp: overflow,
        expCreditCost: { '2': credits }
      });
      expect(result.totalCost['2']).toBe(total);
    }
  );
});
