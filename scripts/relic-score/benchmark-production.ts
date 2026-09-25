import path from 'node:path';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import { buildExpectedBenchmarkIdentity } from '../../src/lib/relic-score/benchmark/identity.js';
import type { BenchmarkExpectedIdentity } from '../../src/lib/relic-score/benchmark/validate.js';
import {
  RELIC_SCORE_CONFIG,
  RELIC_SLOTS,
  validateScoringConfig
} from '../../src/lib/relic-score/scoring-config.js';
import { siteRoot } from '../data/paths.js';
import { loadScoringInputs } from './scoring-inputs.js';

export const productionBenchmarkPath = path.join(
  siteRoot,
  'src/lib/relic-score/generated/farming-benchmarks.json'
);
export const productionAuditPath = path.join(
  siteRoot,
  'docs/relic-score-feature/phase-1e-benchmark-generation-audit.json'
);

export async function loadProductionBenchmarkInputs() {
  validateScoringConfig();
  const inputs = await loadScoringInputs();
  const ids = inputs.profiles.map((profile) => profile.characterId).sort();
  if (ids.length !== 97 || new Set(ids).size !== 97)
    throw new Error(`[relic-score/benchmark] expected 97 reviewed profiles, found ${ids.length}`);
  const cases = ids.flatMap((characterId) =>
    RELIC_SLOTS.flatMap((slot) =>
      inputs.model.mainBySlot[slot].map(({ key: mainStatKey }) => ({
        characterId,
        slot: slot as RelicSlot,
        mainStatKey
      }))
    )
  );
  const expected: BenchmarkExpectedIdentity = buildExpectedBenchmarkIdentity(inputs, {
    N: RELIC_SCORE_CONFIG.benchmark.budgetN,
    K: RELIC_SCORE_CONFIG.benchmark.experimentCount,
    seed: RELIC_SCORE_CONFIG.benchmark.seed,
    cases,
    lens: RELIC_SCORE_CONFIG.benchmark.selectionMode,
    quantilePoints: RELIC_SCORE_CONFIG.benchmark.quantilePoints,
    requireCompleteCoverage: true
  });
  return { inputs, cases, expected };
}
