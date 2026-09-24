import { readFile } from 'node:fs/promises';
import type { BenchmarkArtifact } from '../../src/lib/relic-score/benchmark/types.js';
import { validateBenchmarkArtifact } from '../../src/lib/relic-score/benchmark/validate.js';
import { loadProductionBenchmarkInputs, productionBenchmarkPath } from './benchmark-production.js';

const { cases, expected } = await loadProductionBenchmarkInputs();
let artifact: BenchmarkArtifact;
try {
  artifact = JSON.parse(await readFile(productionBenchmarkPath, 'utf8')) as BenchmarkArtifact;
} catch (error) {
  throw new Error(
    `[relic-score/benchmark] production artifact missing or unreadable; ` +
      `run pnpm relic-score:benchmarks:generate: ${(error as Error).message}`,
    { cause: error }
  );
}
try {
  validateBenchmarkArtifact(artifact, expected);
} catch (error) {
  throw new Error(
    `[relic-score/benchmark] production artifact invalid or stale; ` +
      `run pnpm relic-score:benchmarks:generate: ${(error as Error).message}`,
    { cause: error }
  );
}
console.log(`[relic-score/benchmark] validated ${cases.length}/${cases.length} distributions`);
