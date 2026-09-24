import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  evaluateQuantileGate,
  generateBenchmarkCases
} from '../../scripts/relic-score/benchmark-core.js';
import { maxKnotDrift, parseCandidateList } from '../../scripts/relic-score/calibration-core.js';
import { loadScoringInputs } from '../../scripts/relic-score/scoring-inputs.js';
import {
  RELIC_SCORE_CONFIG,
  validateScoringConfig
} from '../../src/lib/relic-score/scoring-config.js';
import {
  coreBuildScore,
  finalBuildScore,
  pieceNormalized
} from '../../src/lib/relic-score/scoring-math.js';
import { evaluateSetIntegrity } from '../../src/lib/relic-score/score.js';
import { buildPlayerInput } from '../fixtures/relic-score/builders.js';

describe('Phase 1D representation contract', () => {
  it('accepts a dense same-sample fit without treating independent-seed noise as representation error', () => {
    const train = Array.from({ length: 32768 }, (_, index) => index / 32768);
    const independent = train.map((value) => value + 0.02);
    const gate = evaluateQuantileGate(train);
    const changed = evaluateQuantileGate(independent);
    expect(gate.pass257).toBe(true);
    expect(changed.pass257).toBe(true);
    expect(gate.error257.maxAbsoluteCdfError).toBeLessThanOrEqual(0.005);
    expect(gate.error513).toBeNull();
  });

  it('takes the 513 comparison path for a failing small empirical sample', () => {
    const gate = evaluateQuantileGate(Array.from({ length: 16 }, (_, index) => index));
    expect(gate.pass257).toBe(false);
    expect(gate.error513).not.toBeNull();
    expect(gate.error257.maxSampleRankError).toBeGreaterThan(0);
  });
});

describe('Phase 1D candidate and scoring contracts', () => {
  it('emits identical matrix rows for the same seed and candidate grid', () => {
    const command = [
      '--import',
      'tsx',
      'scripts/relic-score/calibrate.ts',
      '--mode=matrix',
      '--n=3',
      '--alpha=0.35',
      '--k=64',
      '--seed=123456789'
    ];
    const run = () =>
      JSON.parse(execFileSync(process.execPath, command, { encoding: 'utf8' })) as {
        matrix: { pieceRows: unknown[]; buildRows: unknown[] };
      };
    const first = run();
    const second = run();
    expect(second.matrix.pieceRows).toEqual(first.matrix.pieceRows);
    expect(second.matrix.buildRows).toEqual(first.matrix.buildRows);
  });

  it('reproduces a same-seed distribution and changes it with an independent seed', async () => {
    const inputs = await loadScoringInputs();
    const options = {
      N: 3,
      K: 128,
      seed: 123456789,
      cases: [{ characterId: '1002', slot: 'BODY' as const }],
      prototype: true as const
    };
    const first = generateBenchmarkCases(inputs, options).cases[0];
    const repeated = generateBenchmarkCases(inputs, options).cases[0];
    const independent = generateBenchmarkCases(inputs, { ...options, seed: 987654321 }).cases[0];
    expect(repeated.samples).toEqual(first.samples);
    expect(repeated.distribution.quantiles).toEqual(first.distribution.quantiles);
    expect(independent.samples).not.toEqual(first.samples);
  });

  it('limits N candidates to nine and parses deterministic alpha and K grids', () => {
    expect(parseCandidateList('1,3,5,7,9', 'n')).toEqual([1, 3, 5, 7, 9]);
    expect(parseCandidateList('0.2,0.25,0.3', 'alpha')).toEqual([0.2, 0.25, 0.3]);
    expect(parseCandidateList('16384,32768,65536', 'k')).toEqual([16384, 32768, 65536]);
    expect(() => parseCandidateList('5,10', 'n')).toThrow(/invalid n/);
    expect(() => parseCandidateList('5,5', 'n')).toThrow(/invalid n/);
    expect(maxKnotDrift([1, 2, 3], [1, 2.5, 4])).toBe(1);
  });

  it('applies config-driven Piece, Core and post-Core modifiers with clamp', () => {
    validateScoringConfig();
    const piece = pieceNormalized(1, 0.5, RELIC_SCORE_CONFIG.piece.mainShare);
    expect(piece).toBeCloseTo(0.35 + 0.65 * 0.5);
    const core = coreBuildScore(piece, 1, RELIC_SCORE_CONFIG.build.statShare);
    expect(core).toBeCloseTo(100 * (0.95 * piece + 0.05));
    expect(finalBuildScore(core, 0.5, 0.5, 4, 8)).toBeCloseTo(core - 2);
    expect(finalBuildScore(99, 1, 0, 4, 8)).toBe(100);
    expect(finalBuildScore(1, 0, 1, 4, 8)).toBe(0);
  });

  it('keeps V1 set partial credit and rejects unlisted sets', async () => {
    const inputs = await loadScoringInputs();
    const recommendation = inputs.recommendations.find((item) => item.avatarId === '1310')!;
    const relics = buildPlayerInput().relics;
    relics.forEach((piece) => {
      piece.setId = 'unlisted';
    });
    expect(evaluateSetIntegrity(relics, recommendation).total).toBe(0);
    relics[0].setId = recommendation.cavernSetIds[0];
    relics[1].setId = recommendation.cavernSetIds[0];
    expect(evaluateSetIntegrity(relics, recommendation).cavern).toBe(0.5);
    relics[2].setId = recommendation.cavernSetIds[0];
    relics[3].setId = recommendation.cavernSetIds[0];
    relics[4].setId = recommendation.planarSetIds[0];
    relics[5].setId = recommendation.planarSetIds[0];
    expect(evaluateSetIntegrity(relics, recommendation).total).toBe(1);
  });
});
