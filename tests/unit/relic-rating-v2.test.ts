import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import runtimeJson from '../../src/lib/generated/runtime/player.json';
import recommendationJson from '../../src/lib/generated/runtime/relic-score-recommendations.json';
import probabilityJson from '../../data/relic-score/probability-model.json';
import { assertPlayerRuntimeData } from '../../src/lib/player/runtime-data';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference';
import { compileProbabilityModel } from '../../src/lib/relic-score/farming/probability-model';
import { benchmarkSha256 } from '../../src/lib/relic-score/benchmark/identity';
import overrideJson from '../../data/relic-score/v2/profile-overrides.json';
import { assertRatingV2Overrides, exceptionsFor } from '../../src/lib/relic-score/v2/overrides';
import { assertRelicScoreRecommendations } from '../../src/lib/relic-score/recommendations';
import {
  deriveRatingV2Profile,
  validateRatingV2Profile,
  FLAT_DISCOUNT,
  type PreferenceRow,
  type RatingV2Profile
} from '../../src/lib/relic-score/v2/profile';
import { generateRatingV2Distribution } from '../../scripts/relic-score/v2-benchmark-core';
import {
  ratingV2ExpectedBenchmark,
  ratingV2SubDigest,
  validateRatingV2Benchmark,
  assertRatingV2PublicationReady,
  type RatingV2Benchmark
} from '../../src/lib/relic-score/v2/benchmark';
import {
  ratingV2Contributions,
  scoreRatingV2Piece,
  scoreRatingV2Build,
  type RatingV2Sources
} from '../../src/lib/relic-score/v2/score';
import { ratingV2RawSubUtility, subUtilityTerm } from '../../src/lib/relic-score/v2/utility';
import { normalizeRatingV2Build } from '../../src/lib/relic-score/v2/normalize';
import { presentRatingV2 } from '../../src/lib/relic-score/v2/presentation';
import { parsePreferenceRows } from '../../scripts/data/relic-rating-v2';
import { adaptEnkaProfile } from '../../api/_player/enka/adapter';
import { decodeEnkaResponse } from '../../api/_player/enka/decode';
import { synthesizePlayerCharacter } from '../../src/lib/player/stat-synthesis';
import { createRatingV2Scorer } from '../../src/lib/server/relic-score/v2';
import { resolveCanonicalPlayerProfile } from '../../api/_player/enka/pipeline';
import { buildPlayerInput } from '../fixtures/relic-score/builders';
import type { RatingV2Profiles } from '../../src/lib/relic-score/v2/profile';
import {
  MAIN_MAPPING_VERSION,
  SUB_MAPPING_VERSION,
  UTILITY_VERSION
} from '../../src/lib/relic-score/v2/profile';

assertPlayerRuntimeData(runtimeJson);
const runtime = runtimeJson;
const reference = buildRelicScoreReferenceData(runtime);
const model = compileProbabilityModel(probabilityJson, runtime);
const fixture = buildPlayerInput();
const recommendations: unknown = recommendationJson;
assertRelicScoreRecommendations(recommendations);
const recommendation = recommendations[fixture.characterId];
const approvedPolicy = (() => {
  const value: unknown = overrideJson;
  assertRatingV2Overrides(value, Object.keys(recommendations), overrideJson.sourceCommit);
  return value;
})();
function profileFor(id = fixture.characterId, element = 'Lightning'): RatingV2Profile {
  const main: PreferenceRow = {
    AvatarID: Number(id),
    Attack: 0.4,
    HP: 0.8,
    Defence: 0.1,
    Speed: 1,
    CriticalChance: 0.8,
    CriticalDamage: 0.8,
    StatusProbability: 0.4,
    BreakDamage: 1,
    DamageAddedRatio: 0.6,
    SPRatio: 0.8,
    HealRatio: 1
  };
  const sub: PreferenceRow = {
    AvatarID: Number(id),
    Attack: 0.4,
    HP: 0.8,
    Defence: 0.1,
    Speed: 1,
    CriticalChance: 0.8,
    CriticalDamage: 0.8,
    StatusProbability: 0.4,
    StatusResistance: 0.1,
    BreakDamage: 1
  };
  return deriveRatingV2Profile({
    characterId: id,
    element,
    main,
    sub,
    recommendation: { ...structuredClone(recommendation), avatarId: id },
    exceptions: exceptionsFor(approvedPolicy, id)
  });
}
function sourcesFor(profile = profileFor()): RatingV2Sources & { benchmark: RatingV2Benchmark } {
  const expected = ratingV2ExpectedBenchmark(model, [profile]);
  const benchmark: RatingV2Benchmark = {
    schemaVersion: 4,
    algorithmVersion: 2,
    sourceCommit: 'a'.repeat(40),
    metadata: {
      prototype: true,
      budgetN: 3,
      experimentCount: 65_536,
      seed: 123_456_789,
      quantilePoints: 257,
      samplingDigest: expected.samplingDigest,
      profileDigests: expected.profileDigests
    },
    distributions: {}
  };
  for (const item of expected.cases)
    ((benchmark.distributions[item.characterId] ??= {})[item.slot] ??= {})[item.mainStatKey] = {
      identityDigest: item.identityDigest,
      quantiles: Array.from({ length: 257 }, (_, index) => (index / 256) * 10),
      summary: { mean: 5, p25: 2.5, p50: 5, p75: 7.5, p90: 9, p95: 9.5, p99: 9.9 }
    };
  return { profile, benchmark, expected, reference, sourceCommit: benchmark.sourceCommit };
}
function available<T>(
  value: { status: 'available'; value: T } | { status: 'unavailable'; reason: string }
): T {
  expect(value.status).toBe('available');
  if (value.status !== 'available') throw new Error(value.reason);
  return value.value;
}

describe('Rating V2 source and mapping policy', () => {
  it('preserves absence vs explicit zero and rejects invalid, duplicate and unknown weights', () => {
    const rows = parsePreferenceRows([{ AvatarID: 1, HP: '0.8', Attack: 0 }], 'sub');
    expect(rows.get('1')).toEqual({ AvatarID: 1, HP: 0.8, Attack: 0 });
    for (const value of [null, true, '', '-0.1', NaN, Infinity, 1.1, -1])
      expect(() => parsePreferenceRows([{ AvatarID: 1, HP: value }], 'main')).toThrow();
    expect(() => parsePreferenceRows([{ AvatarID: 1 }, { AvatarID: 1 }], 'main')).toThrow(
      /duplicate/
    );
    expect(() => parsePreferenceRows([{ AvatarID: 1, Unknown: 1 }], 'sub')).toThrow();
    expect(() => parsePreferenceRows([{ AvatarID: 1, HealRatio: 1 }], 'sub')).toThrow();
    const profile = profileFor();
    expect(profile.slots.BODY.maximum).toBe(1); // healing main remains a legal, defined input
    expect(profile.effectiveSubWeights.AttackDelta).toBe(0.4 * FLAT_DISCOUNT);
    expect(profile.effectiveSubWeights.AttackAddedRatio).toBe(0.4);
    expect(profile.mainWeights.ThunderAddedRatio).toMatchObject({ state: 'present', weight: 0.6 });
    expect(profile.mainWeights.PhysicalAddedRatio).toEqual({ state: 'inapplicable', weight: 0 });
    expect(profile.mainWeights.DefenceDelta).toBeUndefined();
    expect(profileFor(fixture.characterId, 'Thunder').mainWeights).toEqual(profile.mainWeights);
    expect(() => profileFor(fixture.characterId, 'unknown')).toThrow(/DamageType/);
  });

  it('fails closed for recommended absence and cross-element recommendations, including 1505', () => {
    const main: PreferenceRow = {
      AvatarID: 1505,
      Attack: 0.4,
      HP: 0.1,
      Defence: 0.1,
      Speed: 1,
      CriticalChance: 1,
      CriticalDamage: 1,
      BreakDamage: 0.1,
      SPRatio: 1
    };
    const actual = recommendations['1505'];
    const profile = deriveRatingV2Profile({
      characterId: '1505',
      element: 'Physical',
      main,
      sub: {
        AvatarID: 1505,
        Attack: 0.4,
        HP: 0.1,
        Defence: 0.1,
        Speed: 1,
        CriticalChance: 1,
        CriticalDamage: 1,
        StatusResistance: 0.1,
        BreakDamage: 0.1
      },
      recommendation: actual
    });
    expect(profile.status).toBe('needs-review');
    expect(profile.anomalies).toEqual([
      {
        characterId: '1505',
        code: 'RECOMMENDED_WEIGHT_MISSING',
        slot: 'NECK',
        key: 'PhysicalAddedRatio',
        category: 'DamageAddedRatio'
      }
    ]);
    expect(profile.mainWeights.PhysicalAddedRatio?.state).toBe('missing');
    const approved = deriveRatingV2Profile({
      characterId: '1505',
      element: 'Physical',
      main,
      sub: {
        AvatarID: 1505,
        Attack: 0.4,
        HP: 0.1,
        Defence: 0.1,
        Speed: 1,
        CriticalChance: 1,
        CriticalDamage: 1,
        StatusResistance: 0.1,
        BreakDamage: 0.1
      },
      recommendation: actual,
      exceptions: exceptionsFor(approvedPolicy, '1505')
    });
    expect(approved.status).toBe('ready');
    expect(approved.anomalies).toEqual([]);
    expect(approved.mainWeights.PhysicalAddedRatio).toMatchObject({
      state: 'override',
      weight: 0.4,
      original: { state: 'missing', category: 'DamageAddedRatio' }
    });
    expect(approved.slots.NECK.maximum).toBe(0.4);
    expect(ratingV2SubDigest(approved)).toBe(ratingV2SubDigest(profile));
    validateRatingV2Profile(approved, exceptionsFor(approvedPolicy, '1505'));
    expect(() =>
      deriveRatingV2Profile({
        characterId: '1505',
        element: 'Physical',
        main: { ...main, DamageAddedRatio: 0.4 },
        sub: { AvatarID: 1505 },
        recommendation: actual,
        exceptions: exceptionsFor(approvedPolicy, '1505')
      })
    ).toThrow(/Stale\/conflicting/);
    const withoutOrb = structuredClone(actual);
    withoutOrb.mainStatOptions.find((option) => option.slot === 'NECK')!.propertyTypes = [
      'AttackAddedRatio'
    ];
    expect(() =>
      deriveRatingV2Profile({
        characterId: '1505',
        element: 'Physical',
        main,
        sub: { AvatarID: 1505 },
        recommendation: withoutOrb,
        exceptions: exceptionsFor(approvedPolicy, '1505')
      })
    ).toThrow(/Stale\/conflicting/);
    expect(scoreRatingV2Piece(fixture.relics[0], '1505', sourcesFor(profile))).toEqual({
      status: 'unavailable',
      reason: 'profile-review-required'
    });
    expect(() =>
      assertRatingV2PublicationReady(
        { sourceCommit: 'a', profiles: [profile] } as RatingV2Profiles,
        'a'
      )
    ).toThrow(/1505/);
    const cross = structuredClone(profileFor());
    const rec = structuredClone(cross.recommendation);
    rec.mainStatOptions
      .find((option) => option.slot === 'NECK')!
      .propertyTypes.push('FireAddedRatio');
    const sourceMain = {
      AvatarID: 1310,
      HP: 1,
      Attack: 1,
      Defence: 1,
      Speed: 1,
      BreakDamage: 1,
      DamageAddedRatio: 1,
      SPRatio: 1
    };
    const invalid = deriveRatingV2Profile({
      characterId: '1310',
      element: 'Lightning',
      main: sourceMain,
      sub: { AvatarID: 1310, Attack: 1, Speed: 1, BreakDamage: 1, StatusProbability: 1 },
      recommendation: rec
    });
    expect(invalid.anomalies).toContainEqual(
      expect.objectContaining({ code: 'RECOMMENDED_MAIN_INAPPLICABLE', key: 'FireAddedRatio' })
    );
    const zero = deriveRatingV2Profile({
      characterId: '1310',
      element: 'Lightning',
      main: { AvatarID: 1310 },
      sub: { AvatarID: 1310 },
      recommendation
    });
    expect(zero.anomalies.filter((item) => item.code === 'NO_POSITIVE_MAIN_WEIGHT')).toHaveLength(
      4
    );
  });

  it('rejects tampered derived weights and preserves the 257-point representation gate', () => {
    const profile = profileFor();
    expect(() => validateRatingV2Profile(profile)).not.toThrow();
    const tampered = structuredClone(profile);
    tampered.effectiveSubWeights.AttackDelta = 0.4;
    expect(() => validateRatingV2Profile(tampered)).toThrow(/mapping/);
    const item = ratingV2ExpectedBenchmark(model, [profile]).cases[0];
    const diagnostic = () => {
      try {
        generateRatingV2Distribution(model, profile, item, 64);
      } catch (error) {
        return (error as Error).message;
      }
      throw new Error('Small diagnostic unexpectedly passed the representation gate');
    };
    expect(diagnostic()).toMatch(/257-point gate failed.*candidate unchanged/);
    expect(diagnostic()).toBe(diagnostic());
  });
});

describe('Rating V2 math and contract', () => {
  it('uses pure P for fixed/agnostic and continuous slot maxima for ordinary pieces', () => {
    for (const mode of ['fixed', 'explicit-agnostic'] as const) {
      expect(ratingV2Contributions(mode, null, null, 0).score).toBe(0);
      expect(ratingV2Contributions(mode, null, null, 1).score).toBe(100);
    }
    expect(ratingV2Contributions('continuous', 1, 1, 1).score).toBe(100);
    const profile = profileFor();
    profile.mainWeights.HealRatioBase = {
      state: 'missing',
      weight: 0,
      policy: 'nonrecommended-missing-zero-v2'
    };
    profile.slots.BODY.maximum = 0.8;
    const sources = sourcesFor(profile);
    const piece = structuredClone(fixture.relics[2]);
    piece.mainStat = {
      key: 'CriticalChanceBase',
      value: reference.mainAt15.BODY.CriticalChanceBase!
    };
    piece.substats = piece.substats.filter((sub) => sub.key !== piece.mainStat.key);
    const full = available(scoreRatingV2Piece(piece, fixture.characterId, sources));
    expect(full.mainSuitability).toBe(1);
    expect(full.mainContribution).toBe(0.35);
    const nextProfile = structuredClone(profile);
    nextProfile.mainWeights.CriticalChanceBase = { state: 'present', preference: 0.4, weight: 0.4 };
    const next = available(
      scoreRatingV2Piece(piece, fixture.characterId, { ...sources, profile: nextProfile })
    );
    expect(next.mainContribution).toBe(0.175);
    expect(next.subContribution).toBe(full.subContribution);
    piece.mainStat.value /= 2;
    piece.rarity = 3;
    piece.level = 9;
    expect(available(scoreRatingV2Piece(piece, fixture.characterId, sources)).mainCompletion).toBe(
      0.5
    );
    for (const fixed of fixture.relics.slice(0, 2)) {
      const scored = available(scoreRatingV2Piece(fixed, fixture.characterId, sources));
      expect(scored.mainMode).toBe('fixed');
      expect(scored.mainSuitability).toBeNull();
      expect(scored.mainCompletion).toBeNull();
      expect(scored.score).toBeCloseTo(100 * scored.benchmarkPercentile);
    }
    const agnostic = profileFor('1506');
    expect(agnostic.slots.NECK.mode).toBe('explicit-agnostic');
    const scored = available(scoreRatingV2Piece(fixture.relics[4], '1506', sourcesFor(agnostic)));
    expect(scored.score).toBeCloseTo(100 * scored.benchmarkPercentile);
  });

  it('shares exact flat utility while nonrecommended positive stats never add hits', () => {
    const sources = sourcesFor();
    const piece = fixture.relics[0];
    const scored = available(scoreRatingV2Piece(piece, fixture.characterId, sources));
    const flat = scored.substats.find((sub) => sub.key === 'DefenceDelta')!;
    expect(flat.weight).toBe((0.1 * 4) / 9);
    expect(flat.utility).toBeCloseTo((flat.rollEq * 0.1 * 4) / 9);
    expect(flat.effectiveHit).toBe(0);
    expect(scored.rawSubUtility).toBe(
      ratingV2RawSubUtility(
        piece.substats,
        sources.profile!.effectiveSubWeights,
        (key) => model.subByKey[key]!.highRoll
      )
    );
    expect(scored.effectiveHits.total).toBe(7);
    expect(() => subUtilityTerm(1, 0, 1)).toThrow();
  });

  it('rejects invalid relics, stale weights and legacy artifacts; main/alpha changes retain distribution identity', () => {
    const sources = sourcesFor();
    const mainChanged = structuredClone(sources.profile!);
    mainChanged.slots.BODY.maximum = 1;
    mainChanged.mainWeights.HPAddedRatio = { state: 'present', preference: 0.4, weight: 0.4 };
    expect(ratingV2SubDigest(mainChanged)).toBe(ratingV2SubDigest(sources.profile!));
    expect(ratingV2ExpectedBenchmark(model, [mainChanged])).toEqual(sources.expected);
    // A newer source changing only main preferences retains the old distribution's truthful provenance.
    expect(() =>
      validateRatingV2Benchmark(sources.benchmark, sources.expected, 'b'.repeat(40))
    ).not.toThrow();
    const subChanged = structuredClone(sources.profile!);
    subChanged.effectiveSubWeights.SpeedDelta = 0.9;
    expect(
      scoreRatingV2Piece(fixture.relics[0], fixture.characterId, {
        ...sources,
        profile: subChanged
      })
    ).toMatchObject({ reason: 'benchmark-unavailable' });
    expect(() =>
      validateRatingV2Benchmark(
        { ...sources.benchmark, schemaVersion: 3 } as unknown as RatingV2Benchmark,
        sources.expected,
        sources.sourceCommit
      )
    ).toThrow();
    const wrong = structuredClone(fixture.relics[0]);
    wrong.substats[0].key = wrong.mainStat.key;
    expect(scoreRatingV2Piece(wrong, fixture.characterId, sources)).toMatchObject({
      reason: 'piece-unavailable'
    });
    const short = structuredClone(sources.benchmark);
    delete short.distributions[fixture.characterId].HEAD;
    expect(() => validateRatingV2Benchmark(short, sources.expected, sources.sourceCommit)).toThrow(
      /coverage/
    );
    expect(() =>
      validateRatingV2Benchmark(sources.benchmark, sources.expected, sources.sourceCommit, true)
    ).toThrow();
  });

  it('aggregates contributions once, retains sets, and emits version 3 without targets or panel', () => {
    const sources = sourcesFor();
    const input = { characterId: fixture.characterId, relics: fixture.relics };
    const result = scoreRatingV2Build(input, sources);
    const build = available(result.build);
    expect(build.statCompletion).toBeCloseTo(build.mainContribution + build.subContribution);
    expect(build.score).toBeCloseTo(
      100 * (0.95 * build.statCompletion + 0.05 * build.setIntegrity.total)
    );
    expect(build.score).toBeGreaterThanOrEqual(0);
    expect(build.score).toBeLessThanOrEqual(100);
    const dto = presentRatingV2({ status: 'valid', input }, result);
    expect(dto).toMatchObject({ version: 3, algorithmVersion: 2, build: { status: 'available' } });
    expect(JSON.stringify(dto)).not.toMatch(/soft|hard|threshold|panel|mainStatStatus/i);
    expect(
      scoreRatingV2Build({ ...input, relics: input.relics.slice(0, 5) }, sources).build
    ).toMatchObject({ reason: 'incomplete-build' });
  });

  it('scores canonical relics independently of failed panel/light-cone synthesis', () => {
    const raw = JSON.parse(
      readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
    );
    const canonical = adaptEnkaProfile(decodeEnkaResponse(raw));
    const build = canonical.characters[0];
    const before = normalizeRatingV2Build(build, runtime);
    expect(before.status).toBe('valid');
    if (!build.lightCone) throw new Error('Fixture light cone missing');
    build.lightCone.lightConeId = 'unknown';
    expect(synthesizePlayerCharacter(build, runtime).status).toBe('failed');
    expect(normalizeRatingV2Build(build, runtime)).toEqual(before);
    canonical.characters = [build];
    const sources = sourcesFor();
    const profiles: RatingV2Profiles = {
      schemaVersion: 5,
      algorithmVersion: 2,
      sourceCommit: sources.sourceCommit,
      sourceDigests: {},
      overrideDigest: benchmarkSha256(approvedPolicy),
      semanticDigest: benchmarkSha256([sources.profile!]),
      mainMappingVersion: MAIN_MAPPING_VERSION,
      subMappingVersion: SUB_MAPPING_VERSION,
      utilityVersion: UTILITY_VERSION,
      profiles: [sources.profile!]
    };
    const scorer = createRatingV2Scorer(profiles, sources.benchmark, runtime, probabilityJson);
    expect(() =>
      createRatingV2Scorer(
        { ...profiles, semanticDigest: '' },
        sources.benchmark,
        runtime,
        probabilityJson
      )
    ).toThrow('profile schema');
    const integrated = resolveCanonicalPlayerProfile(canonical, runtime, undefined, scorer);
    expect(integrated.normalizedBuilds[0].status).toBe('valid');
    expect(integrated.presentation.characters[0].relicScore!.build.status).toBe('available');
    build.relics[0].mainAffixId = 999;
    const failure = normalizeRatingV2Build(build, runtime);
    expect(failure.status).toBe('unavailable');
    if (failure.status !== 'valid') expect(failure.pieceFailures.HEAD).toBeDefined();
  });
});
