import benchmarkJson from '../../relic-score/generated/farming-benchmarks.json' with { type: 'json' };
import profilesJson from '../../relic-score/generated/character-profiles.json' with { type: 'json' };
import playerRuntimeJson from '../../generated/runtime/player.json' with { type: 'json' };
import probabilityJson from '../../../../data/relic-score/probability-model.json' with { type: 'json' };
import type { RelicSlot } from '../../domain/types.js';
import type { RelicStatKey } from '../../relic-score/stat-registry.js';
import { assertPlayerRuntimeData } from '../../player/runtime-data.js';
import { buildExpectedBenchmarkIdentity } from '../../relic-score/benchmark/identity.js';
import type {
  BenchmarkArtifact,
  BenchmarkDistribution
} from '../../relic-score/benchmark/types.js';
import {
  validateBenchmarkArtifact,
  type BenchmarkExpectedIdentity
} from '../../relic-score/benchmark/validate.js';
import { compileProbabilityModel } from '../../relic-score/farming/probability-model.js';
import type { CharacterProfileArtifact } from '../../relic-score/profile-types.js';
import { buildRelicScoreReferenceData } from '../../relic-score/reference.js';
import {
  RELIC_SCORE_CONFIG,
  RELIC_SLOTS,
  validateScoringConfig
} from '../../relic-score/scoring-config.js';

export type BenchmarkLookupResult =
  | { status: 'available'; distribution: BenchmarkDistribution }
  | { status: 'unavailable'; reason: 'BENCHMARK_MISSING' | 'BENCHMARK_STALE' };

/** Validate once per server instance; no fixture, network access, or simulation. */
export function createBenchmarkLoader(
  artifact: BenchmarkArtifact | undefined,
  expected: BenchmarkExpectedIdentity
) {
  let validation: 'unchecked' | 'valid' | 'stale' = 'unchecked';
  const valid = () => {
    if (validation === 'unchecked') {
      try {
        if (!artifact) throw new Error('missing artifact');
        validateBenchmarkArtifact(artifact, expected);
        validation = 'valid';
      } catch {
        validation = 'stale';
      }
    }
    return validation === 'valid';
  };
  return {
    get(characterId: string, slot: RelicSlot, mainStatKey: RelicStatKey): BenchmarkLookupResult {
      if (!artifact) return { status: 'unavailable', reason: 'BENCHMARK_MISSING' };
      if (!valid()) return { status: 'unavailable', reason: 'BENCHMARK_STALE' };
      const distribution = artifact!.distributions[characterId]?.[slot]?.[mainStatKey];
      return distribution
        ? { status: 'available', distribution }
        : { status: 'unavailable', reason: 'BENCHMARK_MISSING' };
    },
    context():
      | { status: 'available'; artifact: BenchmarkArtifact; expected: BenchmarkExpectedIdentity }
      | { status: 'unavailable'; reason: 'BENCHMARK_MISSING' | 'BENCHMARK_STALE' } {
      if (!artifact) return { status: 'unavailable', reason: 'BENCHMARK_MISSING' };
      return valid()
        ? { status: 'available', artifact: artifact!, expected }
        : { status: 'unavailable', reason: 'BENCHMARK_STALE' };
    }
  };
}

const profiles = profilesJson as CharacterProfileArtifact;
const runtime: unknown = playerRuntimeJson;
let production:
  | {
      loader: ReturnType<typeof createBenchmarkLoader>;
      profiles: CharacterProfileArtifact;
      reference: ReturnType<typeof buildRelicScoreReferenceData>;
    }
  | undefined;

function productionState() {
  if (production) return production;
  validateScoringConfig();
  assertPlayerRuntimeData(runtime);
  const model = compileProbabilityModel(probabilityJson, runtime);
  const ids = profiles.profiles.map((profile) => profile.characterId).sort();
  if (ids.length !== 97 || new Set(ids).size !== 97)
    throw new Error('[relic-score/benchmark] production profile coverage');
  const cases = ids.flatMap((characterId) =>
    RELIC_SLOTS.flatMap((slot) =>
      model.mainBySlot[slot].map(({ key: mainStatKey }) => ({ characterId, slot, mainStatKey }))
    )
  );
  const expected = buildExpectedBenchmarkIdentity(
    { model, profiles: profiles.profiles },
    {
      N: RELIC_SCORE_CONFIG.benchmark.budgetN,
      K: RELIC_SCORE_CONFIG.benchmark.experimentCount,
      seed: RELIC_SCORE_CONFIG.benchmark.seed,
      cases,
      lens: RELIC_SCORE_CONFIG.benchmark.selectionMode,
      quantilePoints: RELIC_SCORE_CONFIG.benchmark.quantilePoints,
      requireCompleteCoverage: true
    }
  );
  production = {
    loader: createBenchmarkLoader(benchmarkJson as unknown as BenchmarkArtifact, expected),
    profiles,
    reference: buildRelicScoreReferenceData(runtime)
  };
  return production;
}

export function getProductionBenchmarkContext() {
  try {
    const state = productionState();
    return { ...state.loader.context(), profiles: state.profiles, reference: state.reference };
  } catch {
    return { status: 'unavailable' as const, reason: 'BENCHMARK_STALE' as const };
  }
}
