import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  benchmarkIdentityDigest,
  probabilityModelDigest
} from '../../src/lib/relic-score/benchmark/identity.js';
import type { BenchmarkArtifact } from '../../src/lib/relic-score/benchmark/types.js';
import { validateBenchmarkArtifact } from '../../src/lib/relic-score/benchmark/validate.js';
import { lookupBenchmarkPercentile } from '../../src/lib/relic-score/benchmark/lookup.js';
import { farmingBudget } from '../../src/lib/relic-score/farming/farming-contract.js';
import { RELIC_SCORE_CONFIG } from '../../src/lib/relic-score/scoring-config.js';
import { createBenchmarkLoader } from '../../src/lib/server/relic-score/benchmark-loader.js';
import { scoreProductionBuild } from '../../src/lib/server/relic-score/score.js';
import { loadProductionBenchmarkInputs } from '../../scripts/relic-score/benchmark-production.js';
import type { PlayerBuildInput } from '../../src/lib/relic-score/types.js';

const artifact = JSON.parse(
  readFileSync('src/lib/relic-score/generated/farming-benchmarks.json', 'utf8')
) as BenchmarkArtifact;
let loaded: Awaited<ReturnType<typeof loadProductionBenchmarkInputs>>;
beforeAll(async () => {
  loaded = await loadProductionBenchmarkInputs();
});

describe('Relic Score production benchmarks', () => {
  it('rejects missing, extra, stale and malformed entries', () => {
    const missing = structuredClone(artifact);
    delete missing.distributions['1002'].BODY;
    expect(() => validateBenchmarkArtifact(missing, loaded.expected)).toThrow(/coverage/);
    const extra = structuredClone(artifact);
    extra.distributions['9999'] = structuredClone(extra.distributions['1002']);
    expect(() => validateBenchmarkArtifact(extra, loaded.expected)).toThrow(/coverage/);
    const stale = structuredClone(artifact);
    stale.metadata.seed++;
    expect(() => validateBenchmarkArtifact(stale, loaded.expected)).toThrow(/stale/);
    const wrongPrng = structuredClone(artifact);
    wrongPrng.metadata.prngVersion = 'different-prng';
    expect(() => validateBenchmarkArtifact(wrongPrng, loaded.expected)).toThrow(/metadata/);
    const wrongGenerator = structuredClone(artifact);
    wrongGenerator.metadata.benchmarkGeneratorVersion = 'different-generator';
    expect(() => validateBenchmarkArtifact(wrongGenerator, loaded.expected)).toThrow(/metadata/);
    const prototype = structuredClone(artifact);
    prototype.metadata.prototype = true;
    expect(() => validateBenchmarkArtifact(prototype, loaded.expected)).toThrow(/prototype/);
    const malformed = structuredClone(artifact);
    malformed.distributions['1002'].BODY!.quantiles[1] = -1;
    expect(() => validateBenchmarkArtifact(malformed, loaded.expected)).toThrow(/quantiles/);
  });

  it('keeps Lens B identity limited to distribution inputs', () => {
    const profile = loaded.inputs.profiles.find((item) => item.characterId === '1002')!;
    const recommendation = loaded.inputs.recommendations.find((item) => item.avatarId === '1002')!;
    const input = {
      characterId: '1002',
      slot: 'BODY' as const,
      profile,
      recommendation,
      model: loaded.inputs.model,
      budget: farmingBudget(RELIC_SCORE_CONFIG.benchmark.budgetN),
      experimentCount: RELIC_SCORE_CONFIG.benchmark.experimentCount,
      seed: RELIC_SCORE_CONFIG.benchmark.seed,
      lens: 'B' as const,
      quantilePoints: RELIC_SCORE_CONFIG.benchmark.quantilePoints
    };
    const digest = benchmarkIdentityDigest(input);
    expect(digest).toBe(loaded.expected.distributions['1002'].BODY);
    const changedRecommendation = structuredClone(recommendation);
    changedRecommendation.mainStatOptions
      .find((item) => item.slot === 'BODY')!
      .propertyTypes.reverse();
    expect(benchmarkIdentityDigest({ ...input, recommendation: changedRecommendation })).toBe(
      digest
    );
    expect(
      benchmarkIdentityDigest({ ...input, lens: 'C', recommendation: changedRecommendation })
    ).not.toBe(benchmarkIdentityDigest({ ...input, lens: 'C' }));
    expect(
      benchmarkIdentityDigest({
        ...input,
        profile: {
          ...profile,
          softTargets: [{ stat: 'SpeedDelta', minimumThreshold: 100, maximumThreshold: 200 }]
        }
      })
    ).toBe(digest);
    expect(
      benchmarkIdentityDigest({
        ...input,
        profile: { ...profile, hardBreakpoints: [{ stat: 'SpeedDelta', threshold: 200 }] }
      })
    ).toBe(digest);
    expect(
      benchmarkIdentityDigest({
        ...input,
        profile: { ...profile, metadata: { ...profile.metadata, reviewReasons: ['new note'] } }
      })
    ).toBe(digest);
    expect(
      benchmarkIdentityDigest({
        ...input,
        profile: { ...profile, substatWeights: { ...profile.substatWeights, SpeedDelta: 0 } }
      })
    ).not.toBe(digest);
    expect(
      benchmarkIdentityDigest({ ...input, budget: farmingBudget(input.budget.pieceCount + 1) })
    ).not.toBe(digest);
    expect(
      benchmarkIdentityDigest({ ...input, experimentCount: input.experimentCount + 1 })
    ).not.toBe(digest);
    expect(benchmarkIdentityDigest({ ...input, seed: input.seed + 1 })).not.toBe(digest);
    const model = structuredClone(input.model);
    model.substats[0]!.affix.stepValue = (model.substats[0]!.affix.stepValue ?? 0) + 0.001;
    expect(benchmarkIdentityDigest({ ...input, model })).not.toBe(digest);
    const probability = structuredClone(input.model);
    probability.config.mainStatProbabilities.BODY[0].probability -= 0.01;
    probability.config.mainStatProbabilities.BODY[1].probability += 0.01;
    expect(benchmarkIdentityDigest({ ...input, model: probability })).not.toBe(digest);
    const provenance = structuredClone(input.model.config);
    provenance.metadata.mainStatProbabilities.source = 'new source note';
    expect(probabilityModelDigest(provenance)).toBe(probabilityModelDigest(input.model.config));
    const scoring = RELIC_SCORE_CONFIG as unknown as {
      piece: { mainShare: number };
      build: { statShare: number; maxSoftTargetBonus: number; maxBreakpointPenalty: number };
      sets: { recommended4pcHalf: number };
    };
    const original = {
      mainShare: scoring.piece.mainShare,
      statShare: scoring.build.statShare,
      bonus: scoring.build.maxSoftTargetBonus,
      penalty: scoring.build.maxBreakpointPenalty,
      halfSet: scoring.sets.recommended4pcHalf
    };
    try {
      scoring.piece.mainShare = 0.4;
      scoring.build.statShare = 0.9;
      scoring.build.maxSoftTargetBonus = 6;
      scoring.build.maxBreakpointPenalty = 10;
      scoring.sets.recommended4pcHalf = 0.25;
      expect(benchmarkIdentityDigest(input)).toBe(digest);
    } finally {
      scoring.piece.mainShare = original.mainShare;
      scoring.build.statShare = original.statShare;
      scoring.build.maxSoftTargetBonus = original.bonus;
      scoring.build.maxBreakpointPenalty = original.penalty;
      scoring.sets.recommended4pcHalf = original.halfSet;
    }
  });

  it('loads formal distributions and scores with the current V1 formula', () => {
    const missing = createBenchmarkLoader(undefined, loaded.expected);
    expect(missing.get('1310', 'HEAD')).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_MISSING'
    });
    const stale = structuredClone(artifact);
    stale.metadata.seed++;
    expect(createBenchmarkLoader(stale, loaded.expected).get('1310', 'HEAD')).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_STALE'
    });
    const distribution = artifact.distributions['1310'].HEAD!;
    expect(lookupBenchmarkPercentile(distribution, -1)).toBe(0);
    expect(lookupBenchmarkPercentile(distribution, distribution.quantiles.at(-1)!)).toBe(1);
    const fixture = JSON.parse(
      readFileSync('tests/fixtures/relic-score/player-builds/complete-five-star.json', 'utf8')
    ) as PlayerBuildInput;
    const recommendation = loaded.inputs.recommendations.find(
      (item) => item.avatarId === fixture.characterId
    )!;
    const result = scoreProductionBuild(fixture, recommendation);
    expect(result.status).toBe('available');
    for (const piece of result.build!.pieces)
      expect(piece.pieceScore).toBeCloseTo(
        100 *
          (RELIC_SCORE_CONFIG.piece.mainShare * piece.mainCompletion +
            RELIC_SCORE_CONFIG.piece.subShare * piece.benchmarkPercentile)
      );
    expect(result.build!.coreBuildScore).toBeCloseTo(
      100 *
        (RELIC_SCORE_CONFIG.build.statShare * result.build!.statCompletion.base +
          RELIC_SCORE_CONFIG.build.setShare * result.build!.setIntegrity.total)
    );
    expect(result.build!.finalBuildScore).toBeCloseTo(
      result.build!.coreBuildScore +
        result.build!.softTargetBonus -
        result.build!.hardBreakpointPenalty
    );
    const breakpointBuild = { ...fixture, characterId: '1409' };
    const breakpointRecommendation = loaded.inputs.recommendations.find(
      (item) => item.avatarId === '1409'
    )!;
    const penalized = scoreProductionBuild(breakpointBuild, breakpointRecommendation);
    expect(penalized.status).toBe('available');
    expect(penalized.build!.hardBreakpointPenalty).toBe(
      RELIC_SCORE_CONFIG.build.maxBreakpointPenalty
    );
    expect(penalized.build!.softTargetBonus).toBeCloseTo(
      RELIC_SCORE_CONFIG.build.maxSoftTargetBonus * (breakpointBuild.panel.effect_res! / 0.5)
    );
    expect(penalized.build!.finalBuildScore).toBeCloseTo(
      penalized.build!.coreBuildScore +
        penalized.build!.softTargetBonus -
        penalized.build!.hardBreakpointPenalty
    );
  });
});
