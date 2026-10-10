import type { PlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import type { CompiledProbabilityModel } from '../../src/lib/relic-score/farming/probability-model.js';
import { createSeededRng } from '../../src/lib/relic-score/farming/prng.js';
import {
  generateFarmingExperiment,
  farmingBudget
} from '../../src/lib/relic-score/farming/farming-contract.js';
import { empiricalQuantile } from '../../src/lib/relic-score/farming/quantile.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import { RELIC_SLOTS } from '../../src/lib/relic-score/scoring-config.js';
import { scoreRatingV2Build } from '../../src/lib/relic-score/v2/score.js';
import {
  ratingV2ExpectedBenchmark,
  validateRatingV2Benchmark,
  type RatingV2Benchmark
} from '../../src/lib/relic-score/v2/benchmark.js';
import type { RatingV2Profiles } from '../../src/lib/relic-score/v2/profile.js';
import type { RatingV2BuildInput } from '../../src/lib/relic-score/v2/normalize.js';

const ALPHAS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
const CHARACTER_IDS = [
  '1102',
  '1205',
  '1309',
  '1001',
  '1211',
  '1409',
  '1413',
  '1506',
  '1415',
  '1015'
];
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p10: empiricalQuantile(sorted, 0.1),
    p50: empiricalQuantile(sorted, 0.5),
    p90: empiricalQuantile(sorted, 0.9)
  };
}
/** Generate relics once; changing alpha only recombines cached piece contributions. */
export function compareRatingV2Alpha(
  profiles: RatingV2Profiles,
  benchmark: RatingV2Benchmark,
  runtime: PlayerRuntimeData,
  model: CompiledProbabilityModel
) {
  const expected = ratingV2ExpectedBenchmark(model, profiles.profiles);
  validateRatingV2Benchmark(benchmark, expected, profiles.sourceCommit, true);
  const reference = buildRelicScoreReferenceData(runtime);
  const rng = createSeededRng(20261010);
  const cases: Array<{
    id: string;
    tier: string;
    input: RatingV2BuildInput;
    scored: ReturnType<typeof scoreRatingV2Build>;
  }> = [];
  for (const characterId of CHARACTER_IDS) {
    const profile = profiles.profiles.find((item) => item.characterId === characterId);
    if (!profile || profile.status !== 'ready')
      throw new Error(`Missing representative ${characterId}`);
    for (const tier of ['best', 'next', 'low', 'low-level']) {
      for (let sample = 0; sample < 128; sample++) {
        const relics = RELIC_SLOTS.map((slot) => {
          const mains = [...model.mainBySlot[slot]].sort(
            (a, b) =>
              (profile.mainWeights[b.key]?.weight ?? 0) -
                (profile.mainWeights[a.key]?.weight ?? 0) || a.key.localeCompare(b.key)
          );
          const next =
            mains.find(
              (main) =>
                (profile.mainWeights[main.key]?.weight ?? 0) <
                (profile.mainWeights[mains[0].key]?.weight ?? 0)
            ) ?? mains[0];
          const main = tier === 'next' ? next : tier === 'low' ? mains[mains.length - 1] : mains[0];
          const generated = generateFarmingExperiment(
            slot,
            farmingBudget(1),
            model,
            rng,
            main.key
          )[0];
          const low = tier === 'low-level';
          const mainAffix = Object.values(runtime.relicMainAffixes).find(
            (affix) =>
              affix.propertyType === main.key &&
              Math.abs(
                affix.baseValue + Number(affix.levelAdd) * 15 - reference.mainAt15[slot][main.key]!
              ) < 1e-8
          );
          if (!mainAffix) throw new Error(`Missing main reference ${slot}:${main.key}`);
          return {
            ...generated,
            relicId: `synthetic-${slot}-${sample}`,
            setId:
              slot === 'NECK' || slot === 'OBJECT'
                ? profile.recommendation.planarSetIds[0]
                : profile.recommendation.cavernSetIds[0],
            rarity: 5,
            level: low ? 0 : 15,
            mainStat: { key: main.key, value: low ? mainAffix.baseValue : main.value },
            substats: (low ? generated.substats.slice(0, 3) : generated.substats).map((sub) => ({
              key: sub.key,
              value: low ? model.subByKey[sub.key]!.affix.baseValue : sub.value,
              occurrenceCount: low ? 1 : sub.occurrenceCount,
              cumulativeStep: low ? 0 : sub.cumulativeStep,
              rollCount: {
                status: 'exact' as const,
                count: low ? 1 : sub.occurrenceCount,
                source: 'provider' as const
              }
            }))
          };
        });
        const input = { characterId, relics };
        const scored = scoreRatingV2Build(input, {
          profile,
          reference,
          benchmark,
          expected,
          sourceCommit: profiles.sourceCommit,
          benchmarkValidated: true
        });
        if (scored.build.status !== 'available')
          throw new Error(`Alpha sample unavailable ${characterId}:${tier}`);
        cases.push({ id: `${characterId}:${tier}:${sample}`, tier, input, scored });
      }
    }
  }
  const scoresAt = (alpha: number) =>
    cases.map((item) => {
      const pieces = item.scored.pieces.map((piece) => {
        if (piece.status !== 'available') throw new Error('Unavailable sample piece');
        const value = piece.value;
        return {
          slot: value.slot,
          score:
            value.mainMode === 'continuous'
              ? 100 *
                (alpha * value.mainSuitability! * value.mainCompletion! +
                  (1 - alpha) * value.benchmarkPercentile)
              : 100 * value.benchmarkPercentile,
          percentile: value.benchmarkPercentile,
          mainSuitability: value.mainSuitability,
          mainMode: value.mainMode
        };
      });
      const sets =
        item.scored.build.status === 'available' ? item.scored.build.value.setIntegrity.total : 0;
      const weights = { HEAD: 0.1, HAND: 0.1, BODY: 0.2, FOOT: 0.2, NECK: 0.2, OBJECT: 0.2 };
      return {
        id: item.id,
        tier: item.tier,
        characterId: item.input.characterId,
        pieces,
        score:
          0.95 * pieces.reduce((sum, piece) => sum + weights[piece.slot] * piece.score, 0) +
          5 * sets
      };
    });
  const baseline = scoresAt(0.35);
  const rows = ALPHAS.map((alpha) => {
    const scores = scoresAt(alpha);
    let rankFlipsFrom035 = 0;
    for (let i = 0; i < scores.length; i++)
      for (let j = i + 1; j < scores.length; j++) {
        if (scores[i].characterId !== scores[j].characterId) continue;
        if ((scores[i].score - scores[j].score) * (baseline[i].score - baseline[j].score) < 0)
          rankFlipsFrom035++;
      }
    const interactions = CHARACTER_IDS.map((characterId) => {
      const character = scores.filter((item) => item.characterId === characterId);
      const lowStrong = character
        .filter((item) => item.tier === 'low')
        .flatMap((item) => item.pieces)
        .filter(
          (piece) =>
            piece.mainMode === 'continuous' && piece.mainSuitability! < 1 && piece.percentile >= 0.9
        );
      const bestWeak = character
        .filter((item) => item.tier === 'best')
        .flatMap((item) => item.pieces)
        .filter((piece) => piece.mainMode === 'continuous' && piece.percentile <= 0.1);
      const comparisons = lowStrong.flatMap((low) =>
        bestWeak.filter((best) => best.slot === low.slot).map((best) => low.score > best.score)
      );
      return {
        characterId,
        strongWrongMainPieces: lowStrong.length,
        weakBestMainPieces: bestWeak.length,
        compensationComparisons: comparisons.length,
        compensationWins: comparisons.filter(Boolean).length,
        build: summary(character.map((item) => item.score)),
        fixedSlots: summary(
          character.flatMap((item) =>
            item.pieces.filter((piece) => piece.mainMode === 'fixed').map((piece) => piece.score)
          )
        ),
        agnosticSlots: character.some((item) =>
          item.pieces.some((piece) => piece.mainMode === 'explicit-agnostic')
        )
          ? summary(
              character.flatMap((item) =>
                item.pieces
                  .filter((piece) => piece.mainMode === 'explicit-agnostic')
                  .map((piece) => piece.score)
              )
            )
          : null
      };
    });
    return {
      alpha,
      piece: summary(scores.flatMap((item) => item.pieces.map((piece) => piece.score))),
      build: summary(scores.map((item) => item.score)),
      interactions,
      rankFlipsFrom035,
      byTier: Object.fromEntries(
        ['best', 'next', 'low', 'low-level'].map((tier) => [
          tier,
          summary(scores.filter((item) => item.tier === tier).map((item) => item.score))
        ])
      ),
      scores
    };
  });
  return {
    sourceCommit: profiles.sourceCommit,
    benchmarkIdentity: benchmark.metadata.samplingDigest,
    sampleSeed: 20261010,
    samplesPerCharacterTier: 128,
    characterIds: CHARACTER_IDS,
    formalAlpha: 0.35,
    rows
  };
}
