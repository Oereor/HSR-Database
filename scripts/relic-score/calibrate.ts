import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { format, resolveConfig } from 'prettier';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import type { RelicStatKey } from '../../src/lib/relic-score/stat-registry.js';
import { lookupBenchmarkPercentile } from '../../src/lib/relic-score/benchmark/lookup.js';
import { validateBenchmarkArtifact } from '../../src/lib/relic-score/benchmark/validate.js';
import { generateNaturalRelic } from '../../src/lib/relic-score/farming/generate-natural-relic.js';
import { createSeededRng } from '../../src/lib/relic-score/farming/prng.js';
import { rawSubUtility } from '../../src/lib/relic-score/farming/prototype.js';
import {
  RELIC_SCORE_CONFIG,
  RELIC_SLOTS,
  validateScoringConfig
} from '../../src/lib/relic-score/scoring-config.js';
import {
  coreBuildScore,
  finalBuildScore,
  pieceNormalized
} from '../../src/lib/relic-score/scoring-math.js';
import { evaluateBreakpoints, evaluateSoftTargets } from '../../src/lib/relic-score/score.js';
import {
  evaluateQuantileGate,
  generateBenchmarkCases,
  type BenchmarkOptions
} from './benchmark-core.js';
import { maxKnotDrift, parseCandidateList, quantile } from './calibration-core.js';
import { loadScoringInputs } from './scoring-inputs.js';

const commandStarted = performance.now();
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = /^--([a-zA-Z]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`[relic-score/calibrate] invalid argument ${arg}`);
    return [match[1], match[2]];
  })
);
for (const key of Object.keys(args))
  if (!['mode', 'n', 'N', 'k', 'K', 'alpha', 'seed', 'cases', 'out'].includes(key))
    throw new Error(`[relic-score/calibrate] unknown option ${key}`);
const mode = args.mode ?? 'all';
validateScoringConfig();
if (!['all', 'representation', 'stability', 'matrix', 'modifiers', 'fixture'].includes(mode))
  throw new Error(`[relic-score/calibrate] invalid mode ${mode}`);
const seed = Number(args.seed ?? RELIC_SCORE_CONFIG.benchmark.seed);
if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
  throw new Error('[relic-score/calibrate] invalid seed');
const Ns = parseCandidateList(
  args.n ??
    (mode === 'fixture' ? undefined : args.N) ??
    (mode === 'all' || mode === 'matrix'
      ? '1,3,5,7,9'
      : String(RELIC_SCORE_CONFIG.benchmark.budgetN)),
  'n'
);
const Ks = parseCandidateList(
  args.k ??
    args.K ??
    (mode === 'all' || mode === 'stability'
      ? '16384,32768,65536'
      : mode === 'fixture'
        ? '512'
        : '8192'),
  'k'
);
const alphas = parseCandidateList(args.alpha ?? '0.2,0.25,0.3,0.35,0.4', 'alpha');
const defaultCases =
  '1002:BODY,1002:NECK,1222:FOOT,1222:OBJECT,1005:BODY,1005:NECK,1101:HEAD,1101:HAND,1104:OBJECT,1409:FOOT';
const cases = (args.cases ?? defaultCases).split(',').map((value) => {
  const [characterId, slot] = value.split(':');
  if (!characterId || !RELIC_SLOTS.includes(slot as RelicSlot))
    throw new Error(`[relic-score/calibrate] invalid case ${value}`);
  return { characterId, slot: slot as RelicSlot };
});
const inputs = await loadScoringInputs();
const profiles = new Map(inputs.profiles.map((item) => [item.characterId, item]));
const recommendations = new Map(inputs.recommendations.map((item) => [item.avatarId, item]));
const run = (N: number, K: number, runSeed: number, selected = cases) => {
  const options: BenchmarkOptions = { N, K, seed: runSeed, cases: selected, prototype: true };
  const generated = generateBenchmarkCases(inputs, options);
  validateBenchmarkArtifact(generated.artifact, generated.expected);
  return generated;
};
const quality = [
  ['poor', 0.05],
  ['below-average', 0.2],
  ['average', 0.5],
  ['good', 0.8],
  ['excellent', 0.95],
  ['extreme', 0.995]
] as const;
type HeldPiece = {
  mainStatKey: RelicStatKey;
  utility: number;
  mainCompletion: number;
  usefulDensity: number;
};
const heldoutSeed = (seed ^ 0xa5a5a5a5) >>> 0;
const corpus = new Map<
  string,
  { correct: Record<string, HeldPiece>; wrong: Record<string, HeldPiece> }
>();
function held(characterId: string, slot: RelicSlot) {
  const key = `${characterId}:${slot}`;
  if (corpus.has(key)) return corpus.get(key)!;
  const profile = profiles.get(characterId)!;
  const recommendation = recommendations.get(characterId)!;
  const mains =
    slot === 'HEAD' || slot === 'HAND'
      ? inputs.model.mainBySlot[slot].map((item) => item.key)
      : (recommendation.mainStatOptions.find((item) => item.slot === slot)?.propertyTypes ?? []);
  const accepted = new Set(mains);
  const rng = createSeededRng(
    (heldoutSeed + Number(characterId) * 17 + RELIC_SLOTS.indexOf(slot)) >>> 0
  );
  const all = Array.from({ length: 4096 }, () => {
    const piece = generateNaturalRelic(slot, inputs.model, rng);
    return {
      mainStatKey: piece.mainStat.key,
      utility: rawSubUtility(piece, profile, inputs.model),
      mainCompletion: accepted.has(piece.mainStat.key) ? 1 : 0,
      usefulDensity:
        piece.substats.filter((sub) => (profile.substatWeights[sub.key] ?? 0) > 0).length /
        piece.substats.length
    };
  });
  const select = (main: number) => {
    const sorted = all
      .filter((item) => item.mainCompletion === main)
      .sort((a, b) => a.utility - b.utility);
    return Object.fromEntries(
      quality.map(([label, p]) => [label, sorted.length ? quantile(sorted, p) : undefined])
    ) as Record<string, HeldPiece>;
  };
  const result = { correct: select(1), wrong: select(0) };
  corpus.set(key, result);
  return result;
}
const output: Record<string, unknown> = {
  phase: '1D',
  mode,
  seed,
  heldoutSeed,
  Ns,
  Ks,
  alphas,
  cases,
  corpusQualityQuantiles: Object.fromEntries(quality),
  modelVersion: inputs.model.config.modelVersion
};

if (mode === 'fixture') {
  if (!args.out) throw new Error('[relic-score/calibrate] --out required for fixture');
  const selected = RELIC_SLOTS.map((slot) => ({ characterId: '1310', slot }));
  const N = Number(args.N ?? 10);
  const generated = run(N, Ks[0], seed, selected);
  await writeFile(
    args.out,
    await format(JSON.stringify(generated.artifact), {
      ...(await resolveConfig(args.out)),
      parser: 'json'
    })
  );
  console.log(JSON.stringify({ mode, N, K: Ks[0], seed, out: args.out }));
} else {
  if (mode === 'all' || mode === 'representation') {
    const N = Ns.includes(RELIC_SCORE_CONFIG.benchmark.budgetN)
      ? RELIC_SCORE_CONFIG.benchmark.budgetN
      : Ns[0];
    const K = Ks.includes(32768) ? 32768 : Ks[0];
    if (K < 16384) throw new Error('[relic-score/calibrate] representation requires k >= 16384');
    output.representation = run(N, K, seed).cases.map((item) => {
      const gate = evaluateQuantileGate(item.samples);
      return {
        characterId: item.characterId,
        slot: item.slot,
        N,
        K,
        seed,
        quantilePoints: 257,
        maxRepresentationError: gate.error257.maxAbsoluteCdfError,
        meanRepresentationError: gate.error257.meanAbsoluteCdfError,
        maxRankError: gate.error257.maxSampleRankError,
        pass: gate.pass257,
        error513: gate.error513?.maxAbsoluteCdfError ?? null,
        runtimeMs: item.runtimeMs
      };
    });
  }
  if (mode === 'all' || mode === 'stability') {
    const N = Ns.includes(RELIC_SCORE_CONFIG.benchmark.budgetN)
      ? RELIC_SCORE_CONFIG.benchmark.budgetN
      : Ns[0];
    const runSeeds = [seed, (seed ^ 0x9e3779b9) >>> 0, (seed ^ 0x85ebca6b) >>> 0];
    const referenceK = Math.max(...Ks);
    const runs = runSeeds.flatMap((runSeed) =>
      Ks.map((K) => ({ runSeed, K, generated: run(N, K, runSeed) }))
    );
    const reference = runs.find((item) => item.runSeed === seed && item.K === referenceK)!;
    output.stability = runs.flatMap(({ runSeed, K, generated }) =>
      generated.cases.map((item, index) => {
        const baseline = reference.generated.cases[index].distribution;
        const s = item.distribution.summary,
          b = baseline.summary;
        const queries = [13, 128, 243, 255].map((index) => baseline.quantiles[index]);
        return {
          N,
          K,
          seed: runSeed,
          characterId: item.characterId,
          slot: item.slot,
          p50Drift: Math.abs(s.p50 - b.p50),
          p90Drift: Math.abs(s.p90 - b.p90),
          p95Drift: Math.abs(s.p95 - b.p95),
          p99Drift: Math.abs(s.p99 - b.p99),
          maxKnotDrift: maxKnotDrift(item.distribution.quantiles, baseline.quantiles),
          maxFixedLookupDrift: Math.max(
            ...queries.map((value) =>
              Math.abs(
                lookupBenchmarkPercentile(item.distribution, value) -
                  lookupBenchmarkPercentile(baseline, value)
              )
            )
          ),
          runtimeMs: item.runtimeMs
        };
      })
    );
    const artifactJson = JSON.stringify(reference.generated.artifact);
    const count = reference.generated.cases.length;
    const meanRuntime =
      reference.generated.cases.reduce((sum, item) => sum + item.runtimeMs, 0) / count;
    const productionCount =
      inputs.profiles.length *
      RELIC_SLOTS.reduce((sum, slot) => sum + inputs.model.mainBySlot[slot].length, 0);
    output.productionProjection = {
      N,
      K: referenceK,
      quantilePoints: 257,
      distributions: productionCount,
      generatedPieces: productionCount * N * referenceK,
      runtimeMs: meanRuntime * productionCount,
      roughQuantileBytes: productionCount * 257 * 8,
      rawJsonBytesApprox: (Buffer.byteLength(artifactJson) / count) * productionCount,
      gzipBytesApprox: (gzipSync(artifactJson).length / count) * productionCount,
      basis: 'linear extrapolation from representative prototype artifact and simulation runtimes'
    };
  }
  if (mode === 'all' || mode === 'matrix') {
    const characters = ['1002', '1222', '1005', '1101', '1104', '1409'];
    const selected = characters.flatMap((characterId) =>
      RELIC_SLOTS.map((slot) => ({ characterId, slot }))
    );
    const K = Ks.includes(8192) ? 8192 : Math.min(...Ks);
    const pieceRows: Array<Record<string, unknown>> = [];
    const buildRows: Array<Record<string, unknown>> = [];
    const runs: Array<{ N: number; K: number; runtimeMs: number }> = [];
    for (const N of Ns) {
      const generated = run(N, K, seed, selected);
      runs.push({
        N,
        K,
        runtimeMs: generated.cases.reduce((sum, item) => sum + item.runtimeMs, 0)
      });
      for (const item of generated.cases) {
        for (const [mainCase, group] of Object.entries(held(item.characterId, item.slot))) {
          for (const [label] of quality) {
            const piece = group[label];
            if (!piece) continue;
            if (piece.mainStatKey !== item.mainStatKey) continue;
            const percentile = lookupBenchmarkPercentile(item.distribution, piece.utility);
            for (const alpha of alphas)
              pieceRows.push({
                N,
                K,
                seed,
                alpha,
                characterId: item.characterId,
                slot: item.slot,
                fixtureQuality: label,
                mainCase,
                rawSubUtility: piece.utility,
                usefulDensity: piece.usefulDensity,
                mainCompletion: piece.mainCompletion,
                benchmarkPercentile: percentile,
                pieceScore: 100 * pieceNormalized(piece.mainCompletion, percentile, alpha)
              });
          }
        }
      }
      for (const characterId of characters)
        for (const [label] of quality)
          for (const alpha of alphas) {
            const S = RELIC_SLOTS.reduce((sum, slot) => {
              const piece = held(characterId, slot).correct[label];
              const distribution =
                generated.artifact.distributions[characterId][slot]![piece.mainStatKey]!;
              return (
                sum +
                RELIC_SCORE_CONFIG.slots[slot] *
                  pieceNormalized(
                    piece.mainCompletion,
                    lookupBenchmarkPercentile(distribution, piece.utility),
                    alpha
                  )
              );
            }, 0);
            for (const T of [0, 2 / 3, 1])
              buildRows.push({
                N,
                K,
                seed,
                alpha,
                characterId,
                buildFixture: label,
                S,
                T,
                coreBuildScore: coreBuildScore(S, T, RELIC_SCORE_CONFIG.build.statShare)
              });
          }
    }
    output.matrix = { K, characters, runs, pieceRows, buildRows };
  }
  if (mode === 'all' || mode === 'modifiers') {
    const N = Ns.includes(RELIC_SCORE_CONFIG.benchmark.budgetN)
      ? RELIC_SCORE_CONFIG.benchmark.budgetN
      : Ns[0];
    const K = Ks.includes(8192) ? 8192 : Math.min(...Ks);
    const selected = ['1222', '1409'].flatMap((characterId) =>
      RELIC_SLOTS.map((slot) => ({ characterId, slot }))
    );
    const generated = run(N, K, seed, selected);
    const coreFor = (characterId: string, label: string) => {
      const S = RELIC_SLOTS.reduce((sum, slot) => {
        const piece = held(characterId, slot).correct[label];
        const distribution =
          generated.artifact.distributions[characterId][slot]![piece.mainStatKey]!;
        return (
          sum +
          RELIC_SCORE_CONFIG.slots[slot] *
            pieceNormalized(
              piece.mainCompletion,
              lookupBenchmarkPercentile(distribution, piece.utility),
              RELIC_SCORE_CONFIG.piece.mainShare
            )
        );
      }, 0);
      return coreBuildScore(S, 1, RELIC_SCORE_CONFIG.build.statShare);
    };
    const softProfile = profiles.get('1222')!;
    const target = softProfile.softTargets[0];
    const softRows = [2, 4, 6].flatMap((maxBonus) =>
      ['average', 'good', 'excellent'].flatMap((label) =>
        [0, 0.25, 0.5, 0.75, 1].map((expectedProgress) => {
          const panel = {
            break_dmg:
              target.minimumThreshold +
              expectedProgress * (target.maximumThreshold - target.minimumThreshold)
          };
          const result = evaluateSoftTargets(softProfile, panel);
          if (result.status !== 'available')
            throw new Error('[relic-score/calibrate] soft panel unavailable');
          const core = coreFor('1222', label);
          const finalScore = finalBuildScore(core, result.value.progress, 0, maxBonus, 0);
          return {
            maxBonus,
            progress: result.value.progress,
            buildFixture: label,
            coreBuildScore: core,
            finalScore,
            delta: finalScore - core
          };
        })
      )
    );
    const bpProfile = profiles.get('1409')!;
    const threshold = bpProfile.hardBreakpoints[0].threshold;
    const penaltyRows = [5, 8, 10].flatMap((maxPenalty) =>
      ['average', 'good', 'excellent'].flatMap((label) =>
        [threshold - 0.001, threshold, threshold + 0.001].map((spd) => {
          const result = evaluateBreakpoints(bpProfile, { spd });
          if (result.status !== 'available')
            throw new Error('[relic-score/calibrate] breakpoint panel unavailable');
          const core = coreFor('1409', label);
          const finalScore = finalBuildScore(core, 0, result.value.failureRatio, 0, maxPenalty);
          return {
            maxPenalty,
            panelValue: spd,
            failureRatio: result.value.failureRatio,
            buildFixture: label,
            coreBuildScore: core,
            finalScore,
            delta: finalScore - core
          };
        })
      )
    );
    output.modifiers = {
      N,
      K,
      seed,
      simulationRuntimeMs: generated.cases.reduce((sum, item) => sum + item.runtimeMs, 0),
      softRows,
      penaltyRows
    };
  }
  output.totalRuntimeMs = performance.now() - commandStarted;
  if (args.out) await writeFile(args.out, await format(JSON.stringify(output), { parser: 'json' }));
  else console.log(JSON.stringify(output, null, 2));
}
