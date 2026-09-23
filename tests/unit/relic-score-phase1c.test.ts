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
  evaluateSoftTargets,
  scoreBuild,
  scorePiece,
  type ScoringSources
} from '../../src/lib/relic-score/score.js';
import type { PlayerBuildInput } from '../../src/lib/relic-score/types.js';
import {
  evaluateQuantileGate,
  expectedBenchmarkIdentity
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
    expect(build.softTargetProgress).toBe(0);
    expect(build.hardBreakpointFailureRatio).toBe(0);
    expect(build.finalModifierStatus).toBe('pending-calibration');
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
      value: { failureRatio: 0, entries: [] }
    });
    const profile = structuredClone(profiles.find((item) => item.characterId === '1409')!);
    const below = evaluateBreakpoints(profile, { spd: 199 });
    const exact = evaluateBreakpoints(profile, { spd: 200 });
    expect(below.status === 'available' && below.value.failureRatio).toBe(1);
    expect(exact.status === 'available' && exact.value.failureRatio).toBe(0);
  });
});

describe('final-panel modifiers pending calibration', () => {
  it('clamps soft target progress and averages multiple targets', () => {
    const profile = structuredClone(sources.profile!);
    profile.softTargets = [
      { stat: 'BreakDamageAddedRatioBase', minimumThreshold: 1, maximumThreshold: 2 }
    ];
    for (const [value, expectedProgress] of [
      [0.5, 0],
      [1, 0],
      [1.5, 0.5],
      [2, 1],
      [3, 1]
    ]) {
      const result = evaluateSoftTargets(profile, { break_dmg: value });
      expect(result.status === 'available' && result.value.progress).toBe(expectedProgress);
    }
    profile.softTargets.push({ stat: 'SpeedDelta', minimumThreshold: 100, maximumThreshold: 200 });
    const multiple = evaluateSoftTargets(profile, { break_dmg: 1.5, spd: 200 });
    expect(multiple.status === 'available' && multiple.value.progress).toBe(0.75);
    expect(evaluateSoftTargets(profile, {})).toEqual({
      status: 'unavailable',
      reason: 'PANEL_MISSING'
    });
    profile.softTargets = [];
    expect(evaluateSoftTargets(profile, {})).toEqual({
      status: 'available',
      value: { progress: 0, entries: [] }
    });
  });

  it('counts failed breakpoints, including exact equality and no breakpoint', () => {
    const profile = structuredClone(sources.profile!);
    profile.hardBreakpoints = [
      { stat: 'SpeedDelta', threshold: 160 },
      { stat: 'SpeedDelta', threshold: 200 }
    ];
    const below = evaluateBreakpoints(profile, { spd: 159 });
    const middle = evaluateBreakpoints(profile, { spd: 160 });
    const above = evaluateBreakpoints(profile, { spd: 201 });
    expect(below.status === 'available' && below.value.failureRatio).toBe(1);
    expect(middle.status === 'available' && middle.value.failureRatio).toBe(0.5);
    expect(above.status === 'available' && above.value.failureRatio).toBe(0);
    expect(evaluateBreakpoints(profile, {})).toEqual({
      status: 'unavailable',
      reason: 'PANEL_MISSING'
    });
    profile.hardBreakpoints = [];
    expect(evaluateBreakpoints(profile, {})).toEqual({
      status: 'available',
      value: { failureRatio: 0, entries: [] }
    });
  });

  it('keeps Piece and benchmark inputs independent of soft target thresholds', async () => {
    const changed = structuredClone(sources.profile!);
    changed.softTargets = [
      { stat: 'BreakDamageAddedRatioBase', minimumThreshold: 1, maximumThreshold: 2 }
    ];
    const pieceBefore = scorePiece(fixture.relics[0], fixture.characterId, sources);
    const pieceAfter = scorePiece(fixture.relics[0], fixture.characterId, {
      ...sources,
      profile: changed
    });
    expect(pieceAfter).toEqual(pieceBefore);
    const build = scoreBuild(fixture, { ...sources, profile: changed });
    expect(build.status).toBe('available');
    expect(build.build?.softTargetProgress).toBe(1);
    expect(build.build?.pieces[0].rawSubUtility).toBe(
      pieceBefore.status === 'available' ? pieceBefore.value.rawSubUtility : NaN
    );
    const inputs = await loadScoringInputs();
    const cases = Object.entries(artifact.distributions).flatMap(([characterId, slots]) =>
      Object.keys(slots).map((slot) => ({ characterId, slot: slot as RelicSlot }))
    );
    const changedInputs = {
      ...inputs,
      profiles: inputs.profiles.map((profile) =>
        profile.characterId === changed.characterId ? changed : profile
      )
    };
    const after = expectedBenchmarkIdentity(changedInputs, {
      N: artifact.metadata.budgetN,
      K: artifact.metadata.experimentCount,
      seed: artifact.metadata.seed,
      cases,
      prototype: true
    });
    expect(after).toEqual(expected);
  });
});
