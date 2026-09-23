import { readFile, writeFile } from 'node:fs/promises';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import { lookupBenchmarkPercentile } from '../../src/lib/relic-score/benchmark/lookup.js';
import { validateBenchmarkArtifact } from '../../src/lib/relic-score/benchmark/validate.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import { scoreBuild, scorePiece } from '../../src/lib/relic-score/score.js';
import type { PlayerBuildInput } from '../../src/lib/relic-score/types.js';
import { generateNaturalRelic } from '../../src/lib/relic-score/farming/generate-natural-relic.js';
import { createSeededRng } from '../../src/lib/relic-score/farming/prng.js';
import { rawSubUtility } from '../../src/lib/relic-score/farming/prototype.js';
import {
  evaluateQuantileGate,
  generateBenchmarkCases,
  type BenchmarkOptions
} from './benchmark-core.js';
import { loadScoringInputs } from './scoring-inputs.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = /^--([a-zA-Z]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`[relic-score/calibrate] invalid argument ${arg}`);
    return [match[1], match[2]];
  })
);
const int = (name: string, fallback: number) => {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isSafeInteger(value) || value < (name === 'seed' ? 0 : 1))
    throw new Error(`[relic-score/calibrate] invalid ${name}`);
  return value;
};
const mode = args.mode ?? 'gate';
if (!['gate', 'n', 'k', 'fixture'].includes(mode))
  throw new Error('[relic-score/calibrate] invalid mode');
const seed = int('seed', 123456789);
const cases = (
  args.cases ??
  '1002:BODY,1222:FOOT,1005:NECK,1101:HEAD,1001:OBJECT,1310:HAND,1002:NECK,1222:OBJECT,1005:BODY,1101:HAND'
)
  .split(',')
  .map((value) => {
    const [characterId, slot] = value.split(':');
    if (!characterId || !['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'].includes(slot))
      throw new Error('[relic-score/calibrate] invalid case');
    return { characterId, slot: slot as RelicSlot };
  });
const inputs = await loadScoringInputs();
const run = (N: number, K: number, selectedCases = cases) => {
  const options: BenchmarkOptions = { N, K, seed, cases: selectedCases, prototype: true };
  const generated = generateBenchmarkCases(inputs, options);
  validateBenchmarkArtifact(generated.artifact, generated.expected);
  return generated;
};
const output: Record<string, unknown> = {
  mode,
  seed,
  cases,
  probabilityVersion: inputs.model.config.modelVersion
};
if (mode === 'gate') {
  const N = int('N', 50),
    K = int('K', 32768);
  if (K < 16384) throw new Error('[relic-score/calibrate] gate requires K >= 16384');
  const generated = run(N, K);
  const verificationSeed = (seed ^ 0x9e3779b9) >>> 0;
  const verification = generateBenchmarkCases(inputs, {
    N,
    K: 16384,
    seed: verificationSeed,
    cases,
    prototype: true
  });
  output.N = N;
  output.K = K;
  output.verificationK = 16384;
  output.verificationSeed = verificationSeed;
  output.validation = generated.cases.map((item, index) => {
    const gate = evaluateQuantileGate(item.samples, verification.cases[index].samples);
    return {
      characterId: item.characterId,
      slot: item.slot,
      N,
      K,
      verificationK: 16384,
      maxCdfError: gate.error257.maxAbsoluteCdfError,
      meanCdfError: gate.error257.meanAbsoluteCdfError,
      maxRankError: gate.error257.maxSampleRankError,
      pass257: gate.pass257,
      error513: gate.error513?.maxAbsoluteCdfError,
      runtimeMs: item.runtimeMs + verification.cases[index].runtimeMs
    };
  });
  output.gatePassed = (output.validation as Array<{ pass257: boolean }>).every(
    (item) => item.pass257
  );
} else if (mode === 'n') {
  const K = int('K', 8192);
  const Ns = (args.Ns ?? '10,25,50,100,200').split(',').map(Number);
  if (Ns.some((N) => !Number.isSafeInteger(N) || N <= 0))
    throw new Error('[relic-score/calibrate] invalid Ns');
  const reference = buildRelicScoreReferenceData(inputs.runtime);
  const fixture = JSON.parse(
    await readFile(
      args.fixture ?? 'tests/fixtures/relic-score/player-builds/complete-five-star.json',
      'utf8'
    )
  ) as PlayerBuildInput;
  const quality = ['poor', 'below-average', 'average', 'good', 'excellent', 'extreme'] as const;
  const quantilePositions = [0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
  const fixedCorpus = Object.fromEntries(
    cases.map(({ characterId, slot }) => {
      const profile = inputs.profiles.find((item) => item.characterId === characterId)!;
      const rng = createSeededRng(
        (seed +
          Number(characterId) * 17 +
          ['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'].indexOf(slot)) >>>
          0
      );
      const values = Array.from({ length: 2048 }, () =>
        rawSubUtility(generateNaturalRelic(slot, inputs.model, rng), profile, inputs.model)
      ).sort((a, b) => a - b);
      return [
        `${characterId}:${slot}`,
        quantilePositions.map((p) => values[Math.floor(p * (values.length - 1))])
      ];
    })
  ) as Record<string, number[]>;
  output.K = K;
  output.Ns = Ns;
  output.sensitivity = Ns.map((N) => {
    const generated = run(N, K);
    const pieces = generated.cases.map((item) => {
      const fixturePiece =
        fixture.characterId === item.characterId
          ? fixture.relics.find((piece) => piece.slot === item.slot)
          : undefined;
      const fixed = fixedCorpus[`${item.characterId}:${item.slot}`];
      const sample = fixed[2];
      const percentile = lookupBenchmarkPercentile(
        item.distribution,
        fixturePiece
          ? fixturePiece.substats.reduce(
              (sum, sub) =>
                sum +
                (sub.value / reference.subHighRoll[sub.key]!) *
                  (inputs.profiles.find((profile) => profile.characterId === item.characterId)!
                    .substatWeights[sub.key] ?? 0),
              0
            )
          : sample
      );
      const pieceScore = fixturePiece
        ? scorePiece(fixturePiece, item.characterId, {
            profile: inputs.profiles.find((profile) => profile.characterId === item.characterId),
            recommendation: inputs.recommendations.find((r) => r.avatarId === item.characterId),
            reference,
            benchmark: generated.artifact,
            benchmarkExpected: generated.expected
          })
        : undefined;
      return {
        characterId: item.characterId,
        slot: item.slot,
        fixture: fixturePiece ? 'existing-normalized' : 'held-out-median',
        rawSubUtility: pieceScore?.status === 'available' ? pieceScore.value.rawSubUtility : sample,
        percentile,
        mainCompletion: pieceScore?.status === 'available' ? pieceScore.value.mainCompletion : null,
        pieceScore: pieceScore?.status === 'available' ? pieceScore.value.pieceScore : null,
        quality: Object.fromEntries(
          quality.map((label, index) => [
            label,
            lookupBenchmarkPercentile(item.distribution, fixed[index])
          ])
        ),
        p50: item.distribution.summary.p50,
        p90: item.distribution.summary.p90,
        p99: item.distribution.summary.p99,
        runtimeMs: item.runtimeMs
      };
    });
    const build =
      fixture.characterId &&
      generated.artifact.distributions[fixture.characterId] &&
      Object.keys(generated.artifact.distributions[fixture.characterId]).length === 6
        ? scoreBuild(fixture, {
            profile: inputs.profiles.find((p) => p.characterId === fixture.characterId),
            recommendation: inputs.recommendations.find((r) => r.avatarId === fixture.characterId),
            reference,
            benchmark: generated.artifact,
            benchmarkExpected: generated.expected
          })
        : null;
    return {
      N,
      pieces,
      build: build?.build
        ? {
            S_base: build.build.statCompletion.base,
            softTargetProgress: build.build.softTargetProgress,
            hardBreakpointFailureRatio: build.build.hardBreakpointFailureRatio,
            T: build.build.setIntegrity.total,
            finalModifierStatus: build.build.finalModifierStatus
          }
        : null
    };
  });
} else if (mode === 'k') {
  const N = int('N', 50);
  const Ks = (args.Ks ?? '8192,16384,32768').split(',').map(Number);
  if (Ks.some((K) => !Number.isSafeInteger(K) || K <= 0))
    throw new Error('[relic-score/calibrate] invalid Ks');
  const selectedCases = cases.slice(0, 3);
  const runs = Ks.map((K) => ({ K, generated: run(N, K, selectedCases) }));
  const largest = runs[runs.length - 1].generated;
  output.N = N;
  output.Ks = Ks;
  output.convergence = runs.flatMap(({ K, generated }) =>
    generated.cases.map((item, index) => {
      const baseline = largest.cases[index].distribution;
      const queries = baseline.quantiles;
      return {
        K,
        characterId: item.characterId,
        slot: item.slot,
        p50Drift: Math.abs(item.distribution.summary.p50 - baseline.summary.p50),
        p90Drift: Math.abs(item.distribution.summary.p90 - baseline.summary.p90),
        p99Drift: Math.abs(item.distribution.summary.p99 - baseline.summary.p99),
        maxLookupDrift: Math.max(
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
} else {
  const N = int('N', 10),
    K = int('K', 512);
  const selectedCases = cases.filter((item) => item.characterId === '1310');
  if (selectedCases.length !== 6)
    throw new Error('[relic-score/calibrate] fixture requires six 1310 slots');
  const generated = run(N, K, selectedCases);
  output.N = N;
  output.K = K;
  output.fixture = true;
  if (!args.out) throw new Error('[relic-score/calibrate] --out required for fixture');
  await writeFile(args.out, `${JSON.stringify(generated.artifact, null, 2)}\n`);
}
const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (args.out && mode !== 'fixture') await writeFile(args.out, serialized);
else console.log(serialized);
