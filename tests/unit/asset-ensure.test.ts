import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets';
import { ensureAssets } from '../../scripts/assets/ensure';
import { assetSourceCommit } from '../../scripts/assets/paths';
import { syncAssets } from '../../scripts/assets/sync';
import { AssetFilesystemObservation } from '../../scripts/assets/observation';
import {
  assetRequirementsFingerprint,
  manifestCoversRequirements,
  manifestFilesExist,
  observeGeneratedAssetFiles,
  readAssetManifest,
  readAssetRequirements,
  type AssetRequirements,
  type AssetFilesFailure
} from '../../scripts/assets/shared';
import type { ManifestReadFailure } from '../../scripts/deployment/cache-diagnostics';

vi.mock('../../scripts/assets/paths', async (original) => ({
  ...(await original<typeof import('../../scripts/assets/paths')>()),
  assertAssetRoot: vi.fn(() => 'fixture'),
  assetSourceCommit: vi.fn()
}));
vi.mock('../../scripts/assets/sync', () => ({ syncAssets: vi.fn() }));
vi.mock('../../scripts/assets/shared', async (original) => {
  const actual = await original<typeof import('../../scripts/assets/shared')>();
  return {
    ...actual,
    readAssetManifest: vi.fn(),
    readAssetRequirements: vi.fn(),
    manifestCoversRequirements: vi.fn(actual.manifestCoversRequirements),
    manifestFilesExist: vi.fn(),
    observeGeneratedAssetFiles: vi.fn(),
    warnAssetFallback: vi.fn()
  };
});

const requirements: AssetRequirements = {
  characterIds: [],
  playerAvatars: [],
  characterDetailIconKeys: [],
  lightConeIds: [],
  relicSetIds: [],
  relicPieces: [],
  relicPropertyIcons: [],
  elements: [],
  paths: [],
  navigationIcons: [],
  brandIcons: [],
  utilityIcons: [],
  endgameModeIcons: []
};
const collection = () => ({ available: [], missing: [] });
const manifest = (): VisualAssetManifest => ({
  schemaVersion: 16,
  generatedAt: 'fixture',
  sourceCommit: 'a'.repeat(40),
  requirementsFingerprint: assetRequirementsFingerprint(requirements),
  characters: { previews: collection(), portraits: collection() },
  playerAvatars: collection(),
  characterDetails: { icons: { resolved: {}, missing: [] } },
  lightCones: { previews: collection(), portraits: collection() },
  relics: { icons: collection(), pieces: collection() },
  relicProperties: { icons: collection() },
  elements: collection(),
  paths: collection(),
  navigation: { icons: collection() },
  branding: { icons: collection() },
  utility: { icons: collection() },
  endgame: { modeIcons: collection() }
});
const observation = new AssetFilesystemObservation('fixture', new Map(), new Map());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(assetSourceCommit).mockReturnValue(manifest().sourceCommit!);
  vi.mocked(readAssetRequirements).mockResolvedValue(requirements);
  vi.mocked(readAssetManifest).mockResolvedValue(manifest());
  vi.mocked(observeGeneratedAssetFiles).mockResolvedValue(observation);
  vi.mocked(manifestFilesExist).mockResolvedValue(true);
  vi.mocked(syncAssets).mockResolvedValue({ manifest: manifest(), observation });
});
afterEach(() => vi.restoreAllMocks());

const expectMiss = (reason: string) => {
  expect(console.log).toHaveBeenCalledWith(
    `[deploy:cache] general-assets result=miss reason=${reason}`
  );
  expect(syncAssets).toHaveBeenCalledOnce();
};

describe('general asset cache reasons and behavior', () => {
  it('distinguishes missing files from observation failures using the real file check', async () => {
    const { manifestFilesExist: checkFiles } = await vi.importActual<
      typeof import('../../scripts/assets/shared')
    >('../../scripts/assets/shared');
    const report = vi.fn();
    await expect(checkFiles(manifest(), 'fixture', observation, report)).resolves.toBe(false);
    expect(report).toHaveBeenCalledExactlyOnceWith('generated-files-missing');
    report.mockClear();
    await expect(checkFiles(manifest(), 'other-root', observation, report)).resolves.toBe(false);
    expect(report).toHaveBeenCalledExactlyOnceWith('filesystem-observation-failed');
    report.mockClear();
    vi.spyOn(observation, 'fileNames').mockImplementationOnce(() => {
      throw new Error('observation failed');
    });
    await expect(checkFiles(manifest(), 'fixture', observation, report)).resolves.toBe(false);
    expect(report).toHaveBeenCalledExactlyOnceWith('filesystem-observation-failed');
    expect(observation.metadataInspections).toBe(0);
  });
  it('reuses a hit and its observation without synchronization or image inspection', async () => {
    const result = await ensureAssets({ env: {} });
    expect(result.observation).toBe(observation);
    expect(observeGeneratedAssetFiles).toHaveBeenCalledOnce();
    expect(manifestCoversRequirements).toHaveBeenCalledOnce();
    expect(manifestFilesExist).toHaveBeenCalledOnce();
    expect(observation.metadataInspections).toBe(0);
    expect(syncAssets).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      '[deploy:cache] general-assets result=hit reason=manifest-source-and-files-match'
    );
  });

  it.each<ManifestReadFailure>([
    'manifest-missing',
    'manifest-read-failed',
    'manifest-parse-failed'
  ])('reports %s and validates only the replacement', async (reason) => {
    vi.mocked(readAssetManifest).mockImplementationOnce(async (report) => {
      report?.(reason);
      return undefined;
    });
    await ensureAssets({ env: {} });
    expectMiss(reason);
    expect(readAssetManifest).toHaveBeenCalledOnce();
    expect(observeGeneratedAssetFiles).not.toHaveBeenCalled();
    expect(manifestFilesExist).toHaveBeenCalledOnce();
  });

  it('does not misreport a parsed null manifest as a missing file', async () => {
    vi.mocked(readAssetManifest).mockResolvedValueOnce(null as unknown as VisualAssetManifest);
    await ensureAssets({ env: {} });
    expectMiss('manifest-schema-invalid');
    expect(observeGeneratedAssetFiles).not.toHaveBeenCalled();
    expect(manifestFilesExist).toHaveBeenCalledOnce();
  });

  it.each([
    'source-changed',
    'requirements-fingerprint-changed',
    'manifest-schema-invalid',
    'requirements-coverage-mismatch'
  ])('reports %s and short circuits later checks', async (reason) => {
    const cached = manifest();
    if (reason === 'source-changed') cached.sourceCommit = 'old';
    if (reason === 'requirements-fingerprint-changed') cached.requirementsFingerprint = 'old';
    if (reason === 'manifest-schema-invalid') Object.assign(cached, { schemaVersion: 0 });
    if (reason === 'requirements-coverage-mismatch')
      cached.characters.previews.available.push('extra');
    vi.mocked(readAssetManifest).mockResolvedValueOnce(cached);
    await ensureAssets({ env: {} });
    expectMiss(reason);
    expect(observeGeneratedAssetFiles).toHaveBeenCalledOnce();
    expect(manifestFilesExist).toHaveBeenCalledOnce(); // replacement only
    expect(manifestCoversRequirements).toHaveBeenCalledTimes(
      reason === 'source-changed' || reason === 'requirements-fingerprint-changed' ? 1 : 2
    );
  });

  it.each<AssetFilesFailure>(['generated-files-missing', 'filesystem-observation-failed'])(
    'reports a file-check failure: %s',
    async (reason) => {
      vi.mocked(manifestFilesExist).mockImplementationOnce(
        async (_manifest, _root, _observation, report) => {
          report?.(reason);
          return false;
        }
      );
      await ensureAssets({ env: {} });
      expectMiss(reason);
      expect(manifestFilesExist).toHaveBeenCalledTimes(2); // one per candidate
      expect(observeGeneratedAssetFiles).toHaveBeenCalledOnce();
    }
  );

  it('observes before comparing the source and reuses the synchronized observation', async () => {
    vi.mocked(readAssetManifest).mockResolvedValueOnce({ ...manifest(), sourceCommit: 'old' });
    vi.mocked(observeGeneratedAssetFiles).mockRejectedValueOnce(new Error('observation failed'));
    await ensureAssets({ env: {} });
    expectMiss('filesystem-observation-failed');
    expect(observeGeneratedAssetFiles).toHaveBeenCalledOnce();
    expect(manifestCoversRequirements).toHaveBeenCalledOnce();
  });

  it('rejects an expected commit mismatch before filesystem observation', async () => {
    await ensureAssets({ env: { HSR_EXPECTED_ASSET_COMMIT: 'expected' } });
    expectMiss('source-changed');
    expect(observeGeneratedAssetFiles).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves offline behavior (deployment=%s)', async (deployment) => {
    const error = new Error('offline');
    vi.mocked(assetSourceCommit).mockImplementationOnce(() => {
      throw error;
    });
    const result = ensureAssets({ env: { HSR_DEPLOYMENT_BUILD: deployment ? '1' : undefined } });
    if (deployment) {
      await expect(result).rejects.toBe(error);
      expect(observeGeneratedAssetFiles).not.toHaveBeenCalled();
    } else {
      await expect(result).resolves.toMatchObject({ observation });
      expect(console.log).toHaveBeenCalledWith(
        '[deploy:cache] general-assets result=fallback reason=source-unavailable-valid-cache'
      );
      expect(manifestFilesExist).toHaveBeenCalledOnce();
    }
    expect(syncAssets).not.toHaveBeenCalled();
  });

  it('keeps the no-valid-fallback path when the source and cache are unavailable', async () => {
    vi.mocked(assetSourceCommit).mockImplementationOnce(() => {
      throw new Error('offline');
    });
    vi.mocked(readAssetManifest).mockResolvedValueOnce(undefined);
    await ensureAssets({ env: {} });
    expectMiss('no-valid-fallback');
    expect(observeGeneratedAssetFiles).not.toHaveBeenCalled();
    expect(manifestFilesExist).toHaveBeenCalledOnce();
  });

  it('does not turn a malformed current-schema exception into an automatic rebuild', async () => {
    const cached = manifest();
    Object.assign(cached, { characters: undefined });
    vi.mocked(readAssetManifest).mockResolvedValueOnce(cached);
    await expect(ensureAssets({ env: {} })).rejects.toBeInstanceOf(TypeError);
    expect(syncAssets).not.toHaveBeenCalled();
    expect(manifestFilesExist).not.toHaveBeenCalled();
    expect(observeGeneratedAssetFiles).toHaveBeenCalledTimes(2); // existing local fallback retry
  });
});
