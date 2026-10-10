import { describe, expect, it } from 'vitest';
import { assertRatingV2GenerationAudit } from '../../src/lib/relic-score/v2/audit';
import type {
  RatingV2Benchmark,
  RatingV2ExpectedBenchmark
} from '../../src/lib/relic-score/v2/benchmark';
import { RATING_V2_BENCHMARK_CONFIG } from '../../src/lib/relic-score/v2/benchmark';

const condition = {
  characterId: '1',
  slot: 'HEAD' as const,
  mainStatKey: 'HPDelta' as const,
  identityDigest: 'a'.repeat(64)
};
const expected: RatingV2ExpectedBenchmark = {
  samplingDigest: 'b'.repeat(64),
  profileDigests: { '1': 'c'.repeat(64) },
  cases: [condition],
  identities: { '1:HEAD:HPDelta': condition.identityDigest }
};
const summary = { mean: 1, p25: 1, p50: 1, p75: 1, p90: 1, p95: 1, p99: 1 };
const artifact: RatingV2Benchmark = {
  schemaVersion: 4,
  algorithmVersion: 2,
  sourceCommit: 'd'.repeat(40),
  metadata: {
    prototype: false,
    budgetN: RATING_V2_BENCHMARK_CONFIG.budgetN,
    experimentCount: RATING_V2_BENCHMARK_CONFIG.experimentCount,
    seed: RATING_V2_BENCHMARK_CONFIG.seed,
    quantilePoints: RATING_V2_BENCHMARK_CONFIG.quantilePoints,
    samplingDigest: expected.samplingDigest,
    profileDigests: expected.profileDigests
  },
  distributions: {
    '1': {
      HEAD: {
        HPDelta: {
          identityDigest: condition.identityDigest,
          summary,
          quantiles: Array(257).fill(1)
        }
      }
    }
  }
};
function audit() {
  return {
    status: 'candidate-gated',
    sourceCommit: artifact.sourceCommit,
    semanticDigest: 'e'.repeat(64),
    overrideDigest: 'f'.repeat(64),
    samplingDigest: expected.samplingDigest,
    subProfileDigests: expected.profileDigests,
    artifactBytes: 100,
    artifactSha256: '0'.repeat(64),
    generationSeconds: 1,
    generatorProvenance: { commit: 'a'.repeat(40), workingDiffSha256: '1'.repeat(64) },
    distributionCount: 1,
    representation: { passCount: 1, failCount: 0, maxError: 0.003 },
    distributions: [
      {
        ...condition,
        summary: { ...summary },
        maxAbsoluteCdfError: 0.003,
        meanAbsoluteCdfError: 0.001,
        maxPercentilePointError: 0.003 * 100,
        maxSampleRankError: 0.003 * 65536,
        queryCount: 200
      }
    ]
  };
}
const bytes = { bytes: 100, sha256: '0'.repeat(64) };
describe('Rating V2 independent generation audit', () => {
  it('verifies exact bytes and each condition, rather than accepting the aggregate alone', () => {
    expect(() => assertRatingV2GenerationAudit(audit(), artifact, expected, bytes)).not.toThrow();
    expect(() =>
      assertRatingV2GenerationAudit(audit(), artifact, expected, { ...bytes, bytes: 101 })
    ).toThrow(/provenance/);
    const missing = audit();
    missing.distributions = [];
    expect(() => assertRatingV2GenerationAudit(missing, artifact, expected, bytes)).toThrow(
      /coverage/
    );
    const stale = audit();
    stale.distributions[0].identityDigest = '2'.repeat(64);
    expect(() => assertRatingV2GenerationAudit(stale, artifact, expected, bytes)).toThrow(
      /condition/
    );
  });
  it('rejects representation failures, fabricated aggregates and changed summaries', () => {
    const failed = audit();
    failed.distributions[0].maxAbsoluteCdfError = 0.006;
    expect(() => assertRatingV2GenerationAudit(failed, artifact, expected, bytes)).toThrow(/gate/);
    const aggregate = audit();
    aggregate.representation.maxError = 0;
    expect(() => assertRatingV2GenerationAudit(aggregate, artifact, expected, bytes)).toThrow(
      /aggregate/
    );
    const changed = audit();
    changed.distributions[0].summary.mean = 2;
    expect(() => assertRatingV2GenerationAudit(changed, artifact, expected, bytes)).toThrow(
      /summary/
    );
  });
});
