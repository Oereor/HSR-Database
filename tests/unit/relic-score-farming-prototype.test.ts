import { describe, expect, it } from 'vitest';
import {
  encodeDenseQuantiles,
  exactEmpiricalCdf,
  lookupDenseCdf,
  measureQuantileError
} from '../../src/lib/relic-score/farming/dense-quantile';
import { farmingBudget } from '../../src/lib/relic-score/farming/farming-contract';
import {
  generateNaturalRelic,
  type GeneratedNaturalRelic
} from '../../src/lib/relic-score/farming/generate-natural-relic';
import {
  rawSubUtility,
  selectCandidate,
  summarizeSelections
} from '../../src/lib/relic-score/farming/prototype';
import { createSeededRng } from '../../src/lib/relic-score/farming/prng';
import {
  benchmarkIdentityDigest,
  loadFarmingInputs,
  probabilityModelDigest
} from '../../scripts/relic-score/farming-inputs';
import { loadProfileInputs, validateCurrentProfiles } from '../../scripts/relic-score/validate';

describe('farming prototype contract', () => {
  it('selects A/B/C independently and preserves the no-candidate state', () => {
    const piece = (
      main: GeneratedNaturalRelic['mainStat']['key'],
      value: number
    ): GeneratedNaturalRelic =>
      ({
        slot: 'BODY',
        rarity: 5,
        level: 15,
        mainStat: { key: main, value: 1 },
        substats: [],
        initialSubstatCount: 4,
        utility: value
      }) as GeneratedNaturalRelic;
    const pieces = [
      piece('HPAddedRatio', 2),
      piece('CriticalChanceBase', 4),
      piece('HPAddedRatio', 3)
    ];
    const utility = (item: GeneratedNaturalRelic) =>
      (item as GeneratedNaturalRelic & { utility: number }).utility;
    const recommended = new Set<GeneratedNaturalRelic['mainStat']['key']>(['HPAddedRatio']);
    expect(selectCandidate(pieces, 'A', recommended, utility)).toEqual({
      status: 'selected',
      utility: 2,
      mainSuitable: true
    });
    expect(selectCandidate(pieces, 'B', recommended, utility)).toEqual({
      status: 'selected',
      utility: 4,
      mainSuitable: false
    });
    expect(selectCandidate(pieces, 'C', recommended, utility)).toEqual({
      status: 'selected',
      utility: 3,
      mainSuitable: true
    });
    expect(selectCandidate(pieces, 'C', new Set(['SpeedDelta']), utility)).toEqual({
      status: 'noEligibleCandidate'
    });
    expect(summarizeSelections([{ status: 'noEligibleCandidate' }])).toMatchObject({
      noEligibleRate: 1,
      mean: null,
      p50: null
    });
  });

  it('uses the 5-star reference and base weights only for prototype utility', async () => {
    const [{ model }, artifact] = await Promise.all([
      loadFarmingInputs(),
      validateCurrentProfiles()
    ]);
    const profile = artifact.profiles.find((item) => item.characterId === '1002')!;
    const piece = generateNaturalRelic('HEAD', model, createSeededRng(4));
    const expected = piece.substats.reduce(
      (total, sub) =>
        total +
        (sub.value / model.subByKey[sub.key]!.highRoll) * (profile.substatWeights[sub.key] ?? 0),
      0
    );
    expect(rawSubUtility(piece, profile, model)).toBeCloseTo(expected, 12);
  });

  it('encodes deterministic monotone dense quantiles and right-continuous ties', () => {
    const sorted = [0, 0, 0, 1, 1, 2, 3, 3, 4];
    for (const points of [257, 513] as const) {
      const quantiles = encodeDenseQuantiles(sorted, points);
      expect(quantiles).toHaveLength(points);
      expect(quantiles[0]).toBe(0);
      expect(quantiles.at(-1)).toBe(4);
      expect(quantiles).toEqual(encodeDenseQuantiles(sorted, points));
      expect(quantiles.every((value, index) => index === 0 || value >= quantiles[index - 1])).toBe(
        true
      );
      expect(lookupDenseCdf(quantiles, -1)).toBe(0);
      expect(lookupDenseCdf(quantiles, 4)).toBe(1);
      expect(lookupDenseCdf(quantiles, 0)).toBeGreaterThan(0);
      expect(lookupDenseCdf(quantiles, 0.5)).toBeGreaterThanOrEqual(lookupDenseCdf(quantiles, 0));
      const error = measureQuantileError(sorted, quantiles);
      expect(error.maxAbsoluteCdfError).toBeGreaterThanOrEqual(0);
      expect(error.queryCount).toBeGreaterThan(0);
    }
    expect(exactEmpiricalCdf(sorted, 0)).toBe(3 / sorted.length);
    expect(() => encodeDenseQuantiles([2, 1], 257)).toThrow('sorted');
  });

  it('digests only scoring inputs and changes with N, seed, lens and quantile count', async () => {
    const [artifact, profiles, { model }] = await Promise.all([
      validateCurrentProfiles(),
      loadProfileInputs(),
      loadFarmingInputs()
    ]);
    const profile = artifact.profiles.find((item) => item.characterId === '1002')!;
    const recommendation = profiles.characters.find(
      (item) => item.id === '1002'
    )!.equipmentRecommendation;
    const input = {
      characterId: '1002',
      slot: 'BODY' as const,
      profile,
      recommendation,
      model,
      budget: farmingBudget(10),
      experimentCount: 100,
      seed: 7,
      lens: 'C' as const,
      quantilePoints: 257 as const
    };
    const digest = benchmarkIdentityDigest(input);
    expect(probabilityModelDigest(model.config)).toBe(
      probabilityModelDigest(structuredClone(model.config))
    );
    expect(probabilityModelDigest(model.config)).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(benchmarkIdentityDigest(input)).toBe(digest);
    expect(benchmarkIdentityDigest({ ...input, budget: farmingBudget(11) })).not.toBe(digest);
    expect(benchmarkIdentityDigest({ ...input, seed: 8 })).not.toBe(digest);
    expect(benchmarkIdentityDigest({ ...input, lens: 'B' })).not.toBe(digest);
    expect(benchmarkIdentityDigest({ ...input, quantilePoints: 513 })).not.toBe(digest);
    expect(
      benchmarkIdentityDigest({
        ...input,
        profile: { ...profile, metadata: { ...profile.metadata, sourceCommit: '0'.repeat(40) } }
      })
    ).toBe(digest);
    expect(
      benchmarkIdentityDigest({
        ...input,
        profile: {
          ...profile,
          softTargets: [{ stat: 'SpeedDelta', minimumThreshold: 120, maximumThreshold: 160 }]
        }
      })
    ).toBe(digest);
    const weightedStat = Object.keys(
      profile.substatWeights
    )[0] as keyof typeof profile.substatWeights;
    const changedWeight = profile.substatWeights[weightedStat] === 0.25 ? 0.5 : 0.25;
    expect(
      benchmarkIdentityDigest({
        ...input,
        profile: {
          ...profile,
          substatWeights: { ...profile.substatWeights, [weightedStat]: changedWeight }
        }
      })
    ).not.toBe(digest);
  });
});
