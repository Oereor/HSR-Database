import { stableBenchmarkSerialize } from '../benchmark/identity.js';
import {
  RATING_V2_BENCHMARK_CONFIG,
  type RatingV2Benchmark,
  type RatingV2ExpectedBenchmark
} from './benchmark.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Rating V2 generation audit');
  return value as Record<string, unknown>;
}
function digest(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
/** Independent verification of every representation result and the exact published bytes. */
export function assertRatingV2GenerationAudit(
  value: unknown,
  artifact: RatingV2Benchmark,
  expected: RatingV2ExpectedBenchmark,
  bytes: { bytes: number; sha256: string }
): void {
  const audit = record(value);
  const representation = record(audit.representation);
  const provenance = record(audit.generatorProvenance);
  if (
    audit.status !== 'candidate-gated' ||
    audit.sourceCommit !== artifact.sourceCommit ||
    !digest(audit.semanticDigest) ||
    !digest(audit.overrideDigest) ||
    audit.samplingDigest !== expected.samplingDigest ||
    stableBenchmarkSerialize(audit.subProfileDigests) !==
      stableBenchmarkSerialize(expected.profileDigests) ||
    audit.artifactSha256 !== bytes.sha256 ||
    audit.artifactBytes !== bytes.bytes ||
    typeof audit.generationSeconds !== 'number' ||
    !Number.isFinite(audit.generationSeconds) ||
    audit.generationSeconds < 0 ||
    typeof provenance.commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(provenance.commit) ||
    !digest(provenance.workingDiffSha256) ||
    audit.distributionCount !== expected.cases.length ||
    representation.passCount !== expected.cases.length ||
    representation.failCount !== 0 ||
    !Array.isArray(audit.distributions) ||
    audit.distributions.length !== expected.cases.length
  )
    throw new Error('Rating V2 generation audit provenance/coverage mismatch');
  const rows = new Map<string, Record<string, unknown>>();
  let maximum = 0;
  for (const value of audit.distributions) {
    const row = record(value);
    const id = `${row.characterId}:${row.slot}:${row.mainStatKey}`;
    if (rows.has(id) || row.identityDigest !== expected.identities[id])
      throw new Error('Rating V2 generation audit condition mismatch');
    for (const field of [
      'maxAbsoluteCdfError',
      'meanAbsoluteCdfError',
      'maxPercentilePointError',
      'maxSampleRankError',
      'queryCount'
    ])
      if (typeof row[field] !== 'number' || !Number.isFinite(row[field]) || row[field] < 0)
        throw new Error('Rating V2 generation audit invalid error measurement');
    const error = row.maxAbsoluteCdfError as number;
    if (
      error > RATING_V2_BENCHMARK_CONFIG.maxRepresentationError ||
      row.queryCount === 0 ||
      !Number.isSafeInteger(row.queryCount) ||
      row.maxPercentilePointError !== error * 100 ||
      row.maxSampleRankError !== error * RATING_V2_BENCHMARK_CONFIG.experimentCount ||
      (row.meanAbsoluteCdfError as number) > error
    )
      throw new Error('Rating V2 generation audit representation gate failed');
    maximum = Math.max(maximum, error);
    rows.set(id, row);
  }
  for (const item of expected.cases) {
    const row = rows.get(`${item.characterId}:${item.slot}:${item.mainStatKey}`);
    const summary =
      artifact.distributions[item.characterId]?.[item.slot]?.[item.mainStatKey]?.summary;
    if (!row || stableBenchmarkSerialize(row.summary) !== stableBenchmarkSerialize(summary))
      throw new Error('Rating V2 generation audit summary mismatch');
  }
  if (representation.maxError !== maximum)
    throw new Error('Rating V2 generation audit aggregate mismatch');
}
