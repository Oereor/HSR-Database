import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifestJson from '../../src/lib/generated/manifest.json' with { type: 'json' };
import runtimeJson from '../../src/lib/generated/runtime/player.json' with { type: 'json' };
import { DATA_MANIFEST_SCHEMA_VERSION } from '../../src/lib/domain/data-manifest.js';
import { assertPlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import { adaptEnkaProfile } from '../../api/_player/enka/adapter.js';
import { decodeEnkaResponse } from '../../api/_player/enka/decode.js';

const runtime: unknown = runtimeJson;
assertPlayerRuntimeData(runtime);
const build = adaptEnkaProfile(
  decodeEnkaResponse(
    JSON.parse(readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8'))
  )
).characters[0];

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.doUnmock('../../src/lib/generated/manifest.json');
  vi.doUnmock('../../data/relic-score/v2/farming-benchmarks.json');
});

describe('production benchmark loader', () => {
  // Includes cold compilation of the complete formal benchmark JSON.
  it('accepts the current manifest and formal artifacts and produces an available score', async () => {
    expect(manifestJson.schemaVersion).toBe(DATA_MANIFEST_SCHEMA_VERSION);
    const { getProductionRatingV2Scorer } =
      await import('../../src/lib/server/relic-score/benchmark-loader.js');
    const scorer = getProductionRatingV2Scorer(runtime);
    expect(getProductionRatingV2Scorer(runtime)).toBe(scorer);
    const { score } = scorer(build);
    expect(score.build).toMatchObject({ status: 'available', score: expect.any(Number) });
    expect(Object.values(score.pieces).every((piece) => piece?.status === 'available')).toBe(true);
  }, 30_000);

  it.each<[string, (manifest: typeof manifestJson) => void]>([
    [
      'previous manifest schema',
      (manifest) => {
        manifest.schemaVersion = DATA_MANIFEST_SCHEMA_VERSION - 1;
      }
    ],
    [
      'future manifest schema',
      (manifest) => {
        manifest.schemaVersion = DATA_MANIFEST_SCHEMA_VERSION + 1;
      }
    ],
    [
      'source commit mismatch',
      (manifest) => {
        manifest.sourceCommit = '0'.repeat(40);
      }
    ],
    [
      'missing benchmark declaration',
      (manifest) => {
        Reflect.deleteProperty(manifest, 'ratingV2BenchmarkInput');
      }
    ],
    [
      'missing profile metadata',
      (manifest) => {
        Reflect.deleteProperty(manifest.artifacts, 'runtime/relic-rating-v2.json');
      }
    ],
    [
      'profile schema mismatch',
      (manifest) => {
        manifest.artifacts['runtime/relic-rating-v2.json'].schemaVersion++;
      }
    ],
    [
      'profile bytes mismatch',
      (manifest) => {
        manifest.artifacts['runtime/relic-rating-v2.json'].bytes++;
      }
    ],
    [
      'profile digest mismatch',
      (manifest) => {
        manifest.artifacts['runtime/relic-rating-v2.json'].sha256 = '0'.repeat(64);
      }
    ],
    [
      'benchmark bytes mismatch',
      (manifest) => {
        manifest.ratingV2BenchmarkInput.bytes++;
      }
    ],
    [
      'benchmark digest mismatch',
      (manifest) => {
        manifest.ratingV2BenchmarkInput.sha256 = '0'.repeat(64);
      }
    ],
    [
      'audit digest mismatch',
      (manifest) => {
        manifest.ratingV2BenchmarkInput.auditSha256 = '0'.repeat(64);
      }
    ]
  ])('rejects %s', async (_name, mutate) => {
    const manifest = structuredClone(manifestJson);
    mutate(manifest);
    vi.doMock('../../src/lib/generated/manifest.json', () => ({ default: manifest }));
    const { getProductionRatingV2Scorer } =
      await import('../../src/lib/server/relic-score/benchmark-loader.js');
    expect(() => getProductionRatingV2Scorer(runtime)).toThrow(
      'Rating V2 formal artifacts unavailable or stale'
    );
  });

  it.each([
    ['missing', undefined],
    ['corrupt', { schemaVersion: -1 }]
  ])('rejects a %s benchmark payload', async (_name, benchmark) => {
    vi.doMock('../../data/relic-score/v2/farming-benchmarks.json', () => ({ default: benchmark }));
    const { getProductionRatingV2Scorer } =
      await import('../../src/lib/server/relic-score/benchmark-loader.js');
    expect(() => getProductionRatingV2Scorer(runtime)).toThrow(
      'Rating V2 formal artifacts unavailable or stale'
    );
  });
});
