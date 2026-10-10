import { describe, expect, it } from 'vitest';
import { lookupDenseCdf } from '../../src/lib/relic-score/benchmark/cdf.js';
import { evaluateSetIntegrity, calculateEffectiveHits } from '../../src/lib/relic-score/metrics.js';
import { buildPlayerInput } from '../fixtures/relic-score/builders.js';
import recommendations from '../../src/lib/generated/runtime/relic-score-recommendations.json';
import type { RelicScoreRecommendation } from '../../src/lib/relic-score/recommendations.js';

describe('shared scoring metrics', () => {
  it('keeps right-continuous ties, interpolation and finite CDF bounds', () => {
    expect(lookupDenseCdf([0, 0, 1, 2, 2], -1)).toBe(0);
    expect(lookupDenseCdf([0, 0, 1, 2, 2], 0)).toBe(0.25);
    expect(lookupDenseCdf([0, 0, 1, 2, 2], 0.5)).toBe(0.375);
    expect(lookupDenseCdf([0, 0, 1, 2, 2], 2)).toBe(1);
    expect(() => lookupDenseCdf([0, 1], NaN)).toThrow();
  });
  it('uses recommendation membership for hits and preserves partial evidence', () => {
    const input = buildPlayerInput();
    const recommendation = (recommendations as Record<string, RelicScoreRecommendation>)[
      input.characterId
    ];
    const head = input.relics[0];
    const sub = head.substats.find((item) =>
      recommendation.subStatPropertyTypes.includes(item.key)
    )!;
    const original = calculateEffectiveHits(head, recommendation);
    sub.rollCount = { status: 'ambiguous', candidates: [1, 2] };
    const partial = calculateEffectiveHits(head, recommendation);
    expect(partial.total).toBeNull();
    expect(partial.unknownRecommendedSubstats).toBe(1);
    expect(partial.known).toBeLessThan(original.known);
  });
  it('retains recommended/other sets, pair tiers and planar halves', () => {
    const input = buildPlayerInput();
    const recommendation = (recommendations as Record<string, RelicScoreRecommendation>)[
      input.characterId
    ];
    input.relics.forEach((piece, index) => {
      piece.setId = index < 4 ? recommendation.cavernSetIds[0] : recommendation.planarSetIds[0];
    });
    expect(evaluateSetIntegrity(input.relics, recommendation).total).toBe(1);
    input.relics[0].setId = 'unlisted';
    expect(evaluateSetIntegrity(input.relics, recommendation).total).toBeCloseTo(
      (2 / 3) * 0.2 + 1 / 3
    );
    input.relics[1].setId = 'unlisted';
    expect(evaluateSetIntegrity(input.relics, recommendation).cavern).toBe(0.5);
    input.relics.forEach((piece) => {
      piece.setId = 'unlisted';
    });
    expect(evaluateSetIntegrity(input.relics, recommendation)).toMatchObject({
      cavern: 0.8,
      planar: 0.5
    });
  });
});
