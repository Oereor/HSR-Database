import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import { lookupBenchmarkPercentile } from '../../src/lib/relic-score/benchmark/lookup.js';
import {
  validateBenchmarkArtifact,
  type BenchmarkExpectedIdentity
} from '../../src/lib/relic-score/benchmark/validate.js';
import type { BenchmarkArtifact } from '../../src/lib/relic-score/benchmark/types.js';
import { lookupDenseCdf } from '../../src/lib/relic-score/farming/dense-quantile.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import { RELIC_SCORE_CONFIG } from '../../src/lib/relic-score/scoring-config.js';
import {
  calculateEffectiveHits,
  evaluateBreakpoints,
  evaluateSetIntegrity,
  evaluateTarget,
  scoreBuild,
  scorePiece,
  type PieceScoreValue,
  type ScoringSources
} from '../../src/lib/relic-score/score.js';
import type { PlayerBuildInput } from '../../src/lib/relic-score/types.js';
import {
  evaluateQuantileGate,
  expectedBenchmarkIdentity,
  generateBenchmarkCases
} from '../../scripts/relic-score/benchmark-core.js';
import { loadScoringInputs } from '../../scripts/relic-score/scoring-inputs.js';

const fixture = JSON.parse(
  readFileSync('tests/fixtures/relic-score/player-builds/complete-five-star.json', 'utf8')
) as PlayerBuildInput;
const artifact = JSON.parse(
  readFileSync('tests/fixtures/relic-score/benchmark/prototype.json', 'utf8')
) as BenchmarkArtifact;
let sources: ScoringSources;
let expected: BenchmarkExpectedIdentity;
let profiles: Awaited<ReturnType<typeof loadScoringInputs>>['profiles'];
beforeAll(async () => {
  const inputs = await loadScoringInputs();
  profiles = inputs.profiles;
  const cases = Object.entries(artifact.distributions).flatMap(([characterId, slots]) =>
    Object.keys(slots).map((slot) => ({ characterId, slot: slot as RelicSlot }))
  );
  expected = expectedBenchmarkIdentity(inputs, {
    N: artifact.metadata.budgetN,
    K: artifact.metadata.experimentCount,
    seed: artifact.metadata.seed,
    cases,
    prototype: true
  });
  sources = {
    profile: inputs.profiles.find((p) => p.characterId === fixture.characterId),
    recommendation: inputs.recommendations.find((r) => r.avatarId === fixture.characterId),
    reference: buildRelicScoreReferenceData(inputs.runtime),
    benchmark: artifact,
    benchmarkExpected: expected
  };
});

describe('Phase 1C benchmark contract', () => {
  it('validates 257 Lens-B knots and rejects stale identity, wrong N, and production fixture use', () => {
    expect(() => validateBenchmarkArtifact(artifact, expected)).not.toThrow();
    const wrongN = structuredClone(expected);
    wrongN.budgetN++;
    expect(() => validateBenchmarkArtifact(artifact, wrongN)).toThrow(/stale/);
    const production = structuredClone(expected);
    production.allowPrototype = false;
    expect(() => validateBenchmarkArtifact(artifact, production)).toThrow(/prototype/);
    const wrongMode = structuredClone(artifact);
    wrongMode.metadata.selectionMode = 'C' as never;
    expect(() => validateBenchmarkArtifact(wrongMode, expected)).toThrow(/metadata/);
    const wrongProfile = structuredClone(expected);
    wrongProfile.profileDigests['1310'] = '0'.repeat(64);
    expect(() => validateBenchmarkArtifact(artifact, wrongProfile)).toThrow(/profile/);
    const nonmonotone = structuredClone(artifact);
    nonmonotone.distributions['1310'].HEAD!.quantiles[5] = -1;
    expect(() => validateBenchmarkArtifact(nonmonotone, expected)).toThrow(/quantiles/);
  });

  it('uses right-continuous ties, interpolation, and endpoint clamp', () => {
    const q = [1, 1, 2, 4];
    expect(lookupDenseCdf(q, 0)).toBe(0);
    expect(lookupDenseCdf(q, 1)).toBeCloseTo(1 / 3);
    expect(lookupDenseCdf(q, 1.5)).toBeCloseTo(0.5);
    expect(lookupDenseCdf(q, 4)).toBe(1);
    expect(lookupBenchmarkPercentile(artifact.distributions['1310'].HEAD!, -100)).toBe(0);
  });

  it('measures a failing 257 gate explicitly and compares 513', () => {
    const train = Array.from({ length: 16384 }, (_, index) => (index < 8192 ? 0 : 1));
    const verify = Array.from({ length: 16384 }, (_, index) => (index < 8500 ? 0 : 1));
    const gate = evaluateQuantileGate(train, verify);
    expect(gate.pass257).toBe(false);
    expect(gate.error257.maxAbsoluteCdfError).toBeGreaterThan(0.005);
    expect(gate.error513).not.toBeNull();
  });
});

describe('Phase 1C scoring', () => {
  it('keeps Piece formula and six-slot weighted aggregation explainable', () => {
    const result = scoreBuild(fixture, sources);
    expect(result.status).toBe('available');
    const build = result.build!;
    expect(build.pieces).toHaveLength(6);
    for (const piece of build.pieces) {
      expect(piece.pieceScore).toBeCloseTo(
        100 * (0.3 * piece.mainCompletion + 0.7 * piece.benchmarkPercentile)
      );
      expect(piece.rawSubUtility).toBeCloseTo(
        piece.substats.reduce((sum, sub) => sum + sub.weightedContribution, 0)
      );
      expect(piece.pieceNormalized).toBeGreaterThanOrEqual(0);
      expect(piece.pieceNormalized).toBeLessThanOrEqual(1);
    }
    expect(build.statCompletion.base).toBeCloseTo(
      build.pieces.reduce(
        (sum, piece) => sum + RELIC_SCORE_CONFIG.slots[piece.slot] * piece.pieceNormalized,
        0
      )
    );
    expect(build.finalBaseScore).toBeCloseTo(
      100 *
        (0.85 * build.statCompletion.base +
          0.1 * build.breakpointScore +
          0.05 * build.setIntegrity.total)
    );
    expect(build.effectiveHits.total).toBe(27);
  });

  it('scores lower rarity and level against unchanged five-star references', () => {
    const full = scorePiece(fixture.relics[0], fixture.characterId, sources);
    const lower = structuredClone(fixture.relics[0]);
    lower.rarity = 3;
    lower.level = 6;
    lower.mainStat.value /= 2;
    const result = scorePiece(lower, fixture.characterId, sources);
    expect(full.status).toBe('available');
    expect(result.status).toBe('available');
    if (full.status === 'available' && result.status === 'available') {
      expect(result.value.mainCompletion).toBeCloseTo(full.value.mainCompletion / 2);
      expect(result.value.pieceScore).toBeLessThan(full.value.pieceScore);
      expect(result.value.substats[0].highRollReference).toBe(
        full.value.substats[0].highRollReference
      );
    }
    const wrong = structuredClone(fixture.relics[2]);
    wrong.mainStat.key = 'CriticalDamageBase';
    const wrongScore = scorePiece(wrong, fixture.characterId, sources);
    expect(wrongScore.status).toBe('available');
    if (wrongScore.status === 'available') expect(wrongScore.value.mainCompletion).toBe(0);
  });

  it('keeps effective hit evidence independent of scoring', () => {
    const piece = structuredClone(fixture.relics[0]);
    piece.substats[1].rollCount = { status: 'ambiguous', candidates: [2, 3] };
    const result = scorePiece(piece, fixture.characterId, sources);
    const exact = scorePiece(fixture.relics[0], fixture.characterId, sources);
    expect(result.status).toBe('available');
    expect(exact.status).toBe('available');
    if (result.status === 'available' && exact.status === 'available') {
      expect(result.value.effectiveHits.status).toBe('partial');
      expect(result.value.pieceScore).toBe(exact.value.pieceScore);
    }
    expect(calculateEffectiveHits(piece, sources.recommendation!).total).toBeNull();
  });

  it('returns missing/stale benchmark unavailable and preserves partial piece results', () => {
    expect(
      scorePiece(fixture.relics[0], fixture.characterId, { ...sources, benchmark: undefined })
        .status
    ).toBe('unavailable');
    const stale = structuredClone(expected);
    stale.seed++;
    expect(
      scorePiece(fixture.relics[0], fixture.characterId, { ...sources, benchmarkExpected: stale })
        .status
    ).toBe('unavailable');
    const incomplete = structuredClone(fixture);
    incomplete.relics.pop();
    const result = scoreBuild(incomplete, sources);
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('BUILD_INCOMPLETE');
    expect(result.pieces.every((piece) => piece.status === 'available')).toBe(true);
  });

  it('does not promote two different recommended cavern 2-piece sets to a 4-piece match', () => {
    const recommendation = structuredClone(sources.recommendation!);
    recommendation.cavernSetIds = ['A', 'B'];
    recommendation.planarSetIds = ['P'];
    const relics = structuredClone(fixture.relics);
    relics.slice(0, 4).forEach((piece, i) => {
      piece.setId = i < 2 ? 'A' : 'B';
    });
    relics.slice(4).forEach((piece) => {
      piece.setId = 'P';
    });
    const result = evaluateSetIntegrity(relics, recommendation);
    expect(result.cavern).toBe(0.5);
    expect(result.planar).toBe(1);
    expect(result.total).toBeCloseTo((2 / 3) * 0.5 + 1 / 3);
    relics.slice(0, 4).forEach((piece) => {
      piece.setId = 'A';
    });
    expect(evaluateSetIntegrity(relics, recommendation).cavern).toBe(1);
  });

  it('scores configured breakpoints and no-breakpoint profiles', () => {
    expect(evaluateBreakpoints(sources.profile!, fixture.panel)).toEqual({
      status: 'available',
      value: { score: 1, entries: [] }
    });
    const profile = structuredClone(profiles.find((item) => item.characterId === '1409')!);
    const below = evaluateBreakpoints(profile, { spd: 199 });
    const exact = evaluateBreakpoints(profile, { spd: 200 });
    expect(below.status === 'available' && below.value.score).toBe(0);
    expect(exact.status === 'available' && exact.value.score).toBe(1);
  });
});

describe('build target primitive', () => {
  it('matches reviewed target crossing semantics and remains continuous and monotone', () => {
    const ids = [
      '1002',
      '1413',
      '1505',
      '8009',
      '1222',
      '1301',
      '1303',
      '1304',
      '1409',
      '1412',
      '1501'
    ];
    let tested = 0;
    for (const id of ids) {
      const profile = profiles.find((item) => item.characterId === id)!;
      for (const target of profile.statTargets) {
        const baseWeight = profile.substatWeights[target.stat] ?? 0;
        const sample = (panel: number) => {
          const piece = {
            slot: 'HEAD',
            substats: [{ stat: target.stat, weightedContribution: panel * baseWeight }]
          } as PieceScoreValue;
          return evaluateTarget(
            target,
            {
              stat: target.stat,
              panelTarget: target.panelTarget,
              baseline: 0,
              contributions: [{ slot: 'HEAD', panelDelta: panel }]
            },
            panel,
            [piece],
            profile
          );
        };
        const eps = target.value * 1e-7;
        const below = sample(target.value - eps),
          exact = sample(target.value),
          above = sample(target.value + eps),
          far = sample(target.value * 2);
        expect(below.targetAwareUtility).toBeLessThanOrEqual(exact.targetAwareUtility);
        expect(exact.targetAwareUtility).toBeLessThanOrEqual(above.targetAwareUtility);
        expect(above.targetAwareUtility).toBeLessThanOrEqual(far.targetAwareUtility);
        expect(Math.abs(exact.targetAwareUtility - below.targetAwareUtility)).toBeLessThan(
          baseWeight * eps * 1.01
        );
        expect(above.targetAwareUtility - exact.targetAwareUtility).toBeCloseTo(
          target.postTargetWeight * eps,
          6
        );
        tested++;
      }
    }
    expect(tested).toBeGreaterThanOrEqual(11);
  });

  it('keeps Candidate B monotone across a real Crit Rate target while A can fall', async () => {
    const inputs = await loadScoringInputs();
    const characterId = '1002';
    const benchmark = generateBenchmarkCases(inputs, {
      N: 3,
      K: 128,
      seed: 123456789,
      cases: ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'].map((slot) => ({
        characterId,
        slot: slot as RelicSlot
      })),
      prototype: true
    });
    const profile = inputs.profiles.find((item) => item.characterId === characterId)!;
    const target = profile.statTargets.find((item) => item.stat === 'CriticalChanceBase')!;
    const baseline = 0.05;
    expect(
      scoreBuild(
        { ...fixture, characterId },
        {
          profile,
          recommendation: inputs.recommendations.find((item) => item.avatarId === characterId),
          reference: buildRelicScoreReferenceData(inputs.runtime),
          benchmark: benchmark.artifact,
          benchmarkExpected: benchmark.expected
        }
      ).reason
    ).toBe('TARGET_CONTEXT_MISSING');
    const values = [target.value - 1e-5, target.value, target.value + 1e-5, target.value * 2].map(
      (panelValue) => {
        const build = structuredClone(fixture);
        build.characterId = characterId;
        build.relics.forEach((piece) => {
          piece.substats = [];
        });
        build.relics[0].substats = [
          {
            key: 'CriticalChanceBase',
            value: panelValue - baseline,
            occurrenceCount: 1,
            cumulativeStep: 0,
            rollCount: { status: 'exact', count: 1, source: 'provider' }
          }
        ];
        build.panel.crit_rate = panelValue;
        const scored = scoreBuild(
          build,
          {
            profile,
            recommendation: inputs.recommendations.find((item) => item.avatarId === characterId),
            reference: buildRelicScoreReferenceData(inputs.runtime),
            benchmark: benchmark.artifact,
            benchmarkExpected: benchmark.expected
          },
          {
            targets: [
              {
                stat: 'CriticalChanceBase',
                panelTarget: 'crit_rate',
                baseline,
                contributions: [{ slot: 'HEAD', panelDelta: panelValue - baseline }]
              }
            ]
          }
        );
        expect(scored.status).toBe('available');
        return scored.build!.statCompletion;
      }
    );
    expect(values[3].targetA!).toBeLessThan(values[1].targetA!);
    expect(values[0].targetB!).toBeLessThanOrEqual(values[1].targetB! + 1e-10);
    expect(values[1].targetB!).toBeLessThanOrEqual(values[2].targetB! + 1e-10);
    expect(values[2].targetB!).toBeLessThanOrEqual(values[3].targetB! + 1e-10);
    expect(values[3].targetB!).toBeCloseTo(values[1].targetB!);
  });
});
