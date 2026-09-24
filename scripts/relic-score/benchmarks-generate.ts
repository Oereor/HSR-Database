import { createHash } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { stableBenchmarkSerialize } from '../../src/lib/relic-score/benchmark/identity.js';
import {
  BENCHMARK_GENERATOR_VERSION,
  BENCHMARK_MAX_REPRESENTATION_ERROR,
  BENCHMARK_QUANTILE_POINTS,
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_SEED_CONTRACT,
  BENCHMARK_SELECTION_MODE,
  BENCHMARK_VERSION,
  type BenchmarkArtifact,
  type BenchmarkDistribution
} from '../../src/lib/relic-score/benchmark/types.js';
import { validateBenchmarkArtifact } from '../../src/lib/relic-score/benchmark/validate.js';
import {
  encodeDenseQuantiles,
  measureQuantileError,
  QUANTILE_REPRESENTATION_VERSION
} from '../../src/lib/relic-score/farming/dense-quantile.js';
import {
  farmingBudget,
  generateFarmingExperiment
} from '../../src/lib/relic-score/farming/farming-contract.js';
import { NATURAL_GENERATOR_VERSION } from '../../src/lib/relic-score/farming/generate-natural-relic.js';
import { rawSubUtility, empiricalQuantile } from '../../src/lib/relic-score/farming/prototype.js';
import { createSeededRng, PRNG_VERSION } from '../../src/lib/relic-score/farming/prng.js';
import { RELIC_SCORE_CONFIG } from '../../src/lib/relic-score/scoring-config.js';
import {
  loadProductionBenchmarkInputs,
  productionAuditPath,
  productionBenchmarkPath
} from './benchmark-production.js';

const started = performance.now();
const { inputs, cases, expected } = await loadProductionBenchmarkInputs();
const profiles = new Map(inputs.profiles.map((profile) => [profile.characterId, profile]));
const distributions: BenchmarkArtifact['distributions'] = {};
const auditRows: Array<{
  characterId: string;
  slot: string;
  summary: BenchmarkDistribution['summary'];
  maxRepresentationError: number;
  meanRepresentationError: number;
  maxRankError: number;
}> = [];
let peakRss = process.memoryUsage().rss;
let peakHeap = process.memoryUsage().heapUsed;
let maxError = 0;
let maxRankError = 0;
let errorSum = 0;
let worstCase = '';
const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const { budgetN: N, experimentCount: K, seed } = RELIC_SCORE_CONFIG.benchmark;
const budget = farmingBudget(N);

for (const [index, { characterId, slot }] of cases.entries()) {
  const profile = profiles.get(characterId)!;
  // Phase 1B/1D contract: restart the same seed for each character/slot distribution.
  const rng = createSeededRng(seed);
  const samples = new Array<number>(K);
  for (let experiment = 0; experiment < K; experiment++) {
    let best = -Infinity;
    for (const piece of generateFarmingExperiment(slot, budget, inputs.model, rng))
      best = Math.max(best, rawSubUtility(piece, profile, inputs.model));
    samples[experiment] = best;
  }
  samples.sort((left, right) => left - right);
  const quantiles = encodeDenseQuantiles(samples, BENCHMARK_QUANTILE_POINTS);
  const error = measureQuantileError(samples, quantiles);
  if (error.maxAbsoluteCdfError > BENCHMARK_MAX_REPRESENTATION_ERROR) {
    const diagnostic = measureQuantileError(samples, encodeDenseQuantiles(samples, 513));
    throw new Error(
      `[relic-score/benchmark] ${characterId}:${slot} 257 gate failed ` +
        `max=${error.maxAbsoluteCdfError} 513=${diagnostic.maxAbsoluteCdfError}; artifact unchanged`
    );
  }
  const summary = {
    mean: samples.reduce((sum, value) => sum + value, 0) / K,
    p25: empiricalQuantile(samples, 0.25),
    p50: empiricalQuantile(samples, 0.5),
    p75: empiricalQuantile(samples, 0.75),
    p90: empiricalQuantile(samples, 0.9),
    p95: empiricalQuantile(samples, 0.95),
    p99: empiricalQuantile(samples, 0.99)
  };
  const distribution: BenchmarkDistribution = {
    identityDigest: expected.distributions[characterId]![slot]!,
    summary,
    quantiles
  };
  (distributions[characterId] ??= {})[slot] = distribution;
  auditRows.push({
    characterId,
    slot,
    summary,
    maxRepresentationError: error.maxAbsoluteCdfError,
    meanRepresentationError: error.meanAbsoluteCdfError,
    maxRankError: error.maxSampleRankError
  });
  errorSum += error.meanAbsoluteCdfError;
  maxRankError = Math.max(maxRankError, error.maxSampleRankError);
  if (error.maxAbsoluteCdfError > maxError) {
    maxError = error.maxAbsoluteCdfError;
    worstCase = `${characterId}:${slot}`;
  }
  const memory = process.memoryUsage();
  peakRss = Math.max(peakRss, memory.rss);
  peakHeap = Math.max(peakHeap, memory.heapUsed);
  if ((index + 1) % 6 === 0)
    console.log(`[relic-score/benchmark] ${index + 1}/${cases.length} generated and gated`);
}

const artifact: BenchmarkArtifact = {
  schemaVersion: BENCHMARK_SCHEMA_VERSION,
  benchmarkVersion: BENCHMARK_VERSION,
  metadata: {
    prototype: false,
    farmingModelVersion: expected.farmingModelVersion,
    generatorVersion: NATURAL_GENERATOR_VERSION,
    benchmarkGeneratorVersion: BENCHMARK_GENERATOR_VERSION,
    prngVersion: PRNG_VERSION,
    seed,
    seedContract: BENCHMARK_SEED_CONTRACT,
    budgetN: N,
    experimentCount: K,
    selectionMode: BENCHMARK_SELECTION_MODE,
    quantileRepresentationVersion: QUANTILE_REPRESENTATION_VERSION,
    quantilePoints: BENCHMARK_QUANTILE_POINTS,
    profileDigests: expected.profileDigests,
    probabilityDigest: expected.probabilityDigest,
    referenceDigest: expected.referenceDigest
  },
  distributions
};
validateBenchmarkArtifact(artifact, expected);
const serialized = `${JSON.stringify(JSON.parse(stableBenchmarkSerialize(artifact)), null, 2)}\n`;
const bytes = Buffer.from(serialized);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const seconds = (performance.now() - started) / 1000;
const audit = {
  config: {
    N,
    K,
    seed,
    seedContract: BENCHMARK_SEED_CONTRACT,
    selectionMode: BENCHMARK_SELECTION_MODE,
    quantilePoints: BENCHMARK_QUANTILE_POINTS
  },
  artifactSha256: sha256,
  artifactBytes: bytes.byteLength,
  artifactGzipBytes: gzipSync(bytes).byteLength,
  generationSeconds: seconds,
  roughPeakRssBytes: peakRss,
  roughPeakHeapBytes: peakHeap,
  distributionCount: cases.length,
  representation: {
    passCount: cases.length,
    failCount: 0,
    maxError,
    meanError: errorSum / cases.length,
    maxRankError,
    worstCase,
    worstCases: [...auditRows]
      .sort(
        (left, right) =>
          right.maxRepresentationError - left.maxRepresentationError ||
          compare(left.characterId, right.characterId) ||
          compare(left.slot, right.slot)
      )
      .slice(0, 10)
      .map(
        ({ characterId, slot, maxRepresentationError, meanRepresentationError, maxRankError }) => ({
          characterId,
          slot,
          maxRepresentationError,
          meanRepresentationError,
          maxRankError
        })
      )
  },
  distributions: auditRows
};
const temporary = `${productionBenchmarkPath}.tmp`;
try {
  await writeFile(temporary, bytes);
  await rename(temporary, productionBenchmarkPath);
} finally {
  await unlink(temporary).catch(() => {});
}
await writeFile(productionAuditPath, `${JSON.stringify(audit, null, 2)}\n`);
const onDisk = await readFile(productionBenchmarkPath);
if (!onDisk.equals(bytes)) throw new Error('[relic-score/benchmark] written artifact differs');
console.log(
  `[relic-score/benchmark] ${cases.length}/${cases.length} generated; ` +
    `${cases.length}/${cases.length} gate passed; ${seconds.toFixed(3)}s; ` +
    `raw=${bytes.byteLength} gzip=${audit.artifactGzipBytes} ` +
    `peakRss=${peakRss} peakHeap=${peakHeap} maxError=${maxError} sha256=${sha256}`
);
