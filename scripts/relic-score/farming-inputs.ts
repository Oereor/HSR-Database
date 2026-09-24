import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import { assertPlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import {
  compileProbabilityModel,
  type CompiledProbabilityModel
} from '../../src/lib/relic-score/farming/probability-model.js';
export {
  benchmarkIdentityDigest,
  probabilityModelDigest
} from '../../src/lib/relic-score/benchmark/identity.js';
export type { BenchmarkIdentityInput } from '../../src/lib/relic-score/benchmark/identity.js';
import { generatedRoot, siteRoot } from '../data/paths.js';

const modelPath = path.join(siteRoot, 'data/relic-score/probability-model.json');

export async function loadFarmingInputs(): Promise<{
  runtime: PlayerRuntimeData;
  model: CompiledProbabilityModel;
}> {
  const [rawRuntime, rawModel] = await Promise.all([
    readFile(path.join(generatedRoot, 'runtime/player.json'), 'utf8'),
    readFile(modelPath, 'utf8')
  ]);
  const runtime: unknown = JSON.parse(rawRuntime);
  assertPlayerRuntimeData(runtime);
  return { runtime, model: compileProbabilityModel(JSON.parse(rawModel), runtime) };
}
