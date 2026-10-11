import benchmarkJson from '../../../../data/relic-score/v2/farming-benchmarks.json' with { type: 'json' };
import auditJson from '../../../../data/relic-score/v2/benchmark-generation-audit.json' with { type: 'json' };
import profilesJson from '../../generated/runtime/relic-rating-v2.json' with { type: 'json' };
import manifest from '../../generated/manifest.json' with { type: 'json' };
import probabilityJson from '../../../../data/relic-score/probability-model.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import type { PlayerRuntimeData } from '../../player/runtime-data.js';
import type { RatingV2Profiles } from '../../relic-score/v2/profile.js';
import {
  ratingV2ExpectedBenchmark,
  type RatingV2Benchmark
} from '../../relic-score/v2/benchmark.js';
import { assertRatingV2GenerationAudit } from '../../relic-score/v2/audit.js';
import { stableBenchmarkSerialize } from '../../relic-score/benchmark/identity.js';
import { compileProbabilityModel } from '../../relic-score/farming/probability-model.js';
import { createRatingV2Scorer } from './v2.js';

type Scorer = ReturnType<typeof createRatingV2Scorer>;
const cache = new WeakMap<PlayerRuntimeData, Scorer | Error>();

/** One formal scorer per runtime. No filesystem, network, simulation or alternate algorithm. */
export function getProductionRatingV2Scorer(runtime: PlayerRuntimeData): Scorer {
  const existing = cache.get(runtime);
  if (existing instanceof Error) throw existing;
  if (existing) return existing;
  try {
    const profiles = profilesJson as unknown as RatingV2Profiles;
    const benchmark = benchmarkJson as unknown as RatingV2Benchmark;
    const declared = manifest.ratingV2BenchmarkInput;
    if (
      manifest.schemaVersion !== 53 ||
      profiles.sourceCommit !== manifest.sourceCommit ||
      !declared
    )
      throw new Error('Rating V2 manifest mismatch');
    const profileBytes = Buffer.from(JSON.stringify(profilesJson) + '\n');
    const profileMetadata = manifest.artifacts['runtime/relic-rating-v2.json'];
    if (
      profileMetadata.schemaVersion !== 5 ||
      profileBytes.length !== profileMetadata.bytes ||
      createHash('sha256').update(profileBytes).digest('hex') !== profileMetadata.sha256
    )
      throw new Error('Rating V2 profile manifest bytes mismatch');
    const expected = ratingV2ExpectedBenchmark(
      compileProbabilityModel(probabilityJson, runtime),
      profiles.profiles
    );
    // Prebuild independently verifies the generator's canonical bytes against the file on disk.
    const bytes = Buffer.from(
      JSON.stringify(JSON.parse(stableBenchmarkSerialize(benchmark)), null, 2) + '\n'
    );
    const auditBytes = Buffer.from(
      JSON.stringify(JSON.parse(stableBenchmarkSerialize(auditJson)), null, 2) + '\n'
    );
    if (
      bytes.length !== declared.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== declared.sha256 ||
      createHash('sha256').update(auditBytes).digest('hex') !== declared.auditSha256
    )
      throw new Error('Rating V2 manifest bytes mismatch');
    assertRatingV2GenerationAudit(auditJson, benchmark, expected, {
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    });
    const scorer = createRatingV2Scorer(
      profiles,
      benchmark,
      runtime,
      probabilityJson,
      'production'
    );
    cache.set(runtime, scorer);
    return scorer;
  } catch {
    const failure = new Error('Rating V2 formal artifacts unavailable or stale');
    cache.set(runtime, failure);
    throw failure;
  }
}
