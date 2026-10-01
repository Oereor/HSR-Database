import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFixtureScoringInputs } from '../fixtures/relic-score/scoring-sources';
import { buildPlayerInput } from '../fixtures/relic-score/builders';
import { loadProfileInputs } from '../../scripts/relic-score/validate';
import { generateCharacterProfile } from '../../scripts/relic-score/profiles';
import {
  resolveMainStatPolicy,
  resolveMainStatStatus,
  VARIABLE_RELIC_SLOTS
} from '../../src/lib/relic-score/main-stat-policy';
import {
  relicStatSemantics,
  RELIC_STAT_REGISTRY,
  type RelicStatKey
} from '../../src/lib/relic-score/stat-registry';
import { pieceContributions } from '../../src/lib/relic-score/scoring-math';
import { scoreBuild, scorePiece, type ScoringSources } from '../../src/lib/relic-score/score';
import { RELIC_SCORE_CONFIG, RELIC_SLOTS } from '../../src/lib/relic-score/scoring-config';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference';
import {
  buildExpectedBenchmarkIdentity,
  benchmarkIdentityDigest,
  profileScoringDigest
} from '../../src/lib/relic-score/benchmark/identity';
import { validateBenchmarkArtifact } from '../../src/lib/relic-score/benchmark/validate';
import { lookupBenchmarkPercentile } from '../../src/lib/relic-score/benchmark/lookup';
import type { BenchmarkArtifact } from '../../src/lib/relic-score/benchmark/types';
import type { VariableRelicSlot } from '../../src/lib/relic-score/profile-types';
import { presentRelicScoreResult } from '../../src/lib/relic-score/presentation';

let sources: ScoringSources;
beforeAll(async () => {
  const inputs = await loadFixtureScoringInputs();
  const artifact = JSON.parse(
    readFileSync('tests/fixtures/relic-score/benchmark/prototype.json', 'utf8')
  ) as BenchmarkArtifact;
  const cases = RELIC_SLOTS.flatMap((slot) =>
    inputs.model.mainBySlot[slot].map(({ key: mainStatKey }) => ({
      characterId: '1310',
      slot,
      mainStatKey
    }))
  );
  sources = {
    profile: inputs.profiles[0],
    recommendation: inputs.recommendations[0],
    reference: buildRelicScoreReferenceData(inputs.runtime),
    benchmark: artifact,
    benchmarkExpected: buildExpectedBenchmarkIdentity(inputs, {
      N: artifact.metadata.budgetN,
      K: artifact.metadata.experimentCount,
      seed: artifact.metadata.seed,
      cases,
      lens: 'B',
      quantilePoints: 257,
      allowPrototype: true,
      requireCompleteCoverage: true
    })
  };
});

describe('main-stat policy', () => {
  it('infers only positive upstream substats on legal same-key slots and never removes upstream', () => {
    for (const key of Object.keys(RELIC_STAT_REGISTRY) as RelicStatKey[]) {
      for (const slot of VARIABLE_RELIC_SLOTS) {
        for (const [recommended, weight] of [
          [true, 1],
          [true, 0],
          [true, undefined],
          [false, 1]
        ] as const) {
          const recommendation = {
            mainStatOptions: [],
            subStatPropertyTypes: recommended ? [key] : []
          };
          const profile = { substatWeights: weight === undefined ? {} : { [key]: weight } };
          const policy = resolveMainStatPolicy(slot, recommendation, profile);
          const legal = relicStatSemantics(key);
          expect(policy.accepted.includes(key)).toBe(
            recommended && weight === 1 && legal.canBeSubstat && legal.mainSlots.includes(slot)
          );
        }
      }
    }
    const recommendation = {
      mainStatOptions: [
        { slot: 'BODY' as const, propertyTypes: ['CriticalChanceBase', 'HealRatioBase'] }
      ],
      subStatPropertyTypes: ['HPDelta', 'AttackDelta']
    };
    const profile = { substatWeights: { HPDelta: 1, AttackDelta: 1 } };
    const policy = resolveMainStatPolicy('BODY', recommendation, profile);
    expect(policy.accepted).toEqual(['CriticalChanceBase', 'HealRatioBase']);
    expect(policy.evidence.HealRatioBase).toEqual(['upstream']);
    for (const [slot, main] of [
      ['HEAD', 'HPDelta'],
      ['HAND', 'AttackDelta']
    ] as const)
      expect(
        resolveMainStatStatus(
          resolveMainStatPolicy(slot, recommendation, { substatWeights: {} }),
          main
        )
      ).toBe('accepted');
    const explicit = resolveMainStatPolicy('OBJECT', recommendation, {
      ...profile,
      mainStatOverrides: { addAccepted: { OBJECT: ['SPRatioBase'] } }
    });
    expect(explicit.evidence.SPRatioBase).toEqual(['explicit-override']);
    expect(resolveMainStatStatus(explicit, 'SPRatioBase')).toBe('accepted');
    const agnostic = resolveMainStatPolicy('BODY', recommendation, {
      ...profile,
      mainStatOverrides: { agnosticSlots: ['BODY'] }
    });
    expect(agnostic.accepted).toEqual(policy.accepted);
    expect(resolveMainStatStatus(agnostic, 'HealRatioBase')).toBe('agnostic');
  });

  it('keeps Q continuous and assigns exactly one normalized contribution formula', () => {
    expect(RELIC_SCORE_CONFIG.piece).toEqual({ mainShare: 0.35, subShare: 0.65 });
    for (const status of ['accepted', 'mismatch', 'agnostic'] as const)
      for (const Q of [0.2, 1])
        for (const P of [0, 0.5, 1]) {
          const result = pieceContributions(status, Q, P, 0.35);
          expect(result.mainCompletion).toBe(
            status === 'agnostic' ? null : status === 'accepted' ? Q : 0
          );
          expect(result.mainContribution).toBeCloseTo(status === 'accepted' ? 0.35 * Q : 0);
          expect(result.subContribution).toBeCloseTo(status === 'agnostic' ? P : 0.65 * P);
          expect(result.pieceNormalized).toBeCloseTo(
            result.mainContribution + result.subContribution
          );
        }
  });

  it('aggregates 0/1/2/4 agnostic slots once, with unchanged targets, sets and hits', () => {
    const input = buildPlayerInput();
    const baseline = scoreBuild(input, sources).build!;
    for (const slots of [
      [],
      ['NECK'],
      ['NECK', 'OBJECT'],
      [...VARIABLE_RELIC_SLOTS]
    ] as VariableRelicSlot[][]) {
      const profile = {
        ...sources.profile!,
        mainStatOverrides: slots.length ? { agnosticSlots: slots } : undefined
      };
      profile.softTargets = [{ stat: 'SpeedDelta', minimumThreshold: 100, maximumThreshold: 200 }];
      profile.hardBreakpoints = [{ stat: 'SpeedDelta', threshold: 160 }];
      const result = scoreBuild(input, { ...sources, profile });
      expect(result.status).toBe('available');
      const build = result.build!;
      let expectedBase = 0;
      for (const piece of build.pieces) {
        const expected = slots.includes(piece.slot as VariableRelicSlot)
          ? piece.benchmarkPercentile
          : 0.35 * piece.mainCompletion! + 0.65 * piece.benchmarkPercentile;
        expect(piece.pieceNormalized).toBeCloseTo(expected);
        expect(piece.pieceNormalized).toBeCloseTo(piece.mainContribution + piece.subContribution);
        expectedBase += RELIC_SCORE_CONFIG.slots[piece.slot] * expected;
      }
      expect(build.statCompletion.base).toBeCloseTo(expectedBase);
      expect(
        build.statCompletion.aggregatedMainPart + build.statCompletion.aggregatedSubPart
      ).toBeCloseTo(expectedBase);
      expect(build.statCompletion.normalized).toBeCloseTo(
        (95 * expectedBase + 8 * ((input.panel.spd! - 100) / 100) + 5) / 108
      );
      expect(build.finalBuildScore).toBeCloseTo(
        100 * (0.95 * build.statCompletion.normalized + 0.05 * baseline.setIntegrity.total)
      );
      expect(build.setIntegrity).toEqual(baseline.setIntegrity);
      expect(build.effectiveHits).toEqual(baseline.effectiveHits);
      expect(build.finalBuildScore).toBeGreaterThanOrEqual(0);
      expect(build.finalBuildScore).toBeLessThanOrEqual(100);
    }
  });

  it('uses actual main CDFs in agnostic pieces and serializes the v2 contract', () => {
    const input = buildPlayerInput();
    const profile = {
      ...sources.profile!,
      mainStatOverrides: { agnosticSlots: ['FOOT' as const] }
    };
    const identities: string[] = [];
    for (const key of ['SpeedDelta', 'DefenceAddedRatio'] as const) {
      const piece = structuredClone(input.relics.find((piece) => piece.slot === 'FOOT')!);
      piece.mainStat = { key, value: sources.reference.mainAt15.FOOT[key]! / 2 };
      const result = scorePiece(piece, input.characterId, { ...sources, profile });
      expect(result.status).toBe('available');
      if (result.status !== 'available') throw new Error('synthetic piece unavailable');
      const distribution = sources.benchmark!.distributions[input.characterId].FOOT![key]!;
      expect(result.value.mainCompletion).toBeNull();
      expect(result.value.benchmarkPercentile).toBe(
        lookupBenchmarkPercentile(distribution, result.value.rawSubUtility)
      );
      expect(result.value.pieceScore).toBeCloseTo(100 * result.value.benchmarkPercentile);
      expect(result.value.benchmarkIdentity).toBe(distribution.identityDigest);
      identities.push(result.value.benchmarkIdentity);
      const missing = structuredClone(sources.benchmark!);
      delete missing.distributions[input.characterId].FOOT![key];
      expect(
        scorePiece(piece, input.characterId, { ...sources, profile, benchmark: missing })
      ).toEqual({ status: 'unavailable', reason: 'BENCHMARK_MISSING_OR_STALE' });
    }
    expect(identities[0]).not.toBe(identities[1]);
    const presentation = presentRelicScoreResult(
      { status: 'valid', input },
      scoreBuild(input, { ...sources, profile })
    );
    expect(presentation.version).toBe(2);
    expect(presentation.pieces.FOOT).toMatchObject({
      mainStatStatus: 'agnostic',
      mainCompletion: null
    });
    expect(presentation.pieces.HEAD).toMatchObject({
      mainStatStatus: 'accepted',
      mainCompletion: 1
    });
    expect(JSON.stringify(presentation)).not.toMatch(
      /quantiles|substatWeights|mainContribution|benchmarkIdentity/
    );
    const stale = {
      ...profile,
      metadata: { ...profile.metadata, reviewStatus: 'needs-review' as const }
    };
    expect(scorePiece(input.relics[0], input.characterId, { ...sources, profile: stale })).toEqual({
      status: 'unavailable',
      reason: 'PROFILE_MISSING_OR_UNREVIEWED'
    });
  });

  it('keeps 1413 and 1506 exceptions in config, and all production utility identities unchanged', async () => {
    const inputs = await loadProfileInputs();
    for (const id of ['1413', '1506', '1006']) {
      const character = inputs.characters.find((character) => character.id === id)!;
      const profile = generateCharacterProfile(
        character,
        inputs.templates,
        inputs.overrides.overrides[id],
        inputs.sourceCommit
      );
      if (id === '1413') {
        const natural = resolveMainStatPolicy('OBJECT', character.equipmentRecommendation, {
          substatWeights: profile.substatWeights
        });
        expect(resolveMainStatStatus(natural, 'SPRatioBase')).toBe('mismatch');
        const resolved = resolveMainStatPolicy(
          'OBJECT',
          character.equipmentRecommendation,
          profile
        );
        expect(resolved.evidence.SPRatioBase).toEqual(['explicit-override']);
      } else if (id === '1506') {
        for (const slot of ['NECK', 'OBJECT'] as const)
          expect(
            resolveMainStatPolicy(slot, character.equipmentRecommendation, profile).agnostic
          ).toBe(true);
        expect(inputs.overrides.overrides[id].scalingStat).toBeNull();
        expect(profile.hardBreakpoints).toEqual([{ stat: 'SpeedDelta', threshold: 160 }]);
      } else expect(profile.mainStatOverrides).toBeUndefined();
    }
    const artifact = JSON.parse(
      readFileSync('src/lib/relic-score/generated/farming-benchmarks.json', 'utf8')
    ) as BenchmarkArtifact;
    const { model } = await loadFixtureScoringInputs();
    let distributions = 0;
    for (const character of inputs.characters) {
      const profile = generateCharacterProfile(
        character,
        inputs.templates,
        inputs.overrides.overrides[character.id],
        inputs.sourceCommit
      );
      expect(profileScoringDigest(profile)).toBe(artifact.metadata.profileDigests[character.id]);
      expect(
        profileScoringDigest({
          ...profile,
          mainStatOverrides: { agnosticSlots: [...VARIABLE_RELIC_SLOTS] }
        })
      ).toBe(profileScoringDigest(profile));
      for (const slot of RELIC_SLOTS)
        for (const { key: mainStatKey } of model.mainBySlot[slot]) {
          expect(
            benchmarkIdentityDigest({
              characterId: character.id,
              slot,
              mainStatKey,
              profile,
              model,
              budget: {
                unit: 'target-slot-natural-piece',
                pieceCount: RELIC_SCORE_CONFIG.benchmark.budgetN,
                rarity: 5,
                enhancementLevel: 15,
                enhanceAll: true
              },
              experimentCount: RELIC_SCORE_CONFIG.benchmark.experimentCount,
              seed: RELIC_SCORE_CONFIG.benchmark.seed,
              lens: 'B',
              quantilePoints: 257
            })
          ).toBe(artifact.distributions[character.id][slot]![mainStatKey]!.identityDigest);
          distributions++;
        }
    }
    expect(distributions).toBe(inputs.characters.length * 28);
    // Fixture identity still validates; no production approval or artifact write.
    expect(() =>
      validateBenchmarkArtifact(sources.benchmark!, sources.benchmarkExpected!)
    ).not.toThrow();
  });
});
