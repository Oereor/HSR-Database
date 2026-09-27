import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataManifest } from '../../src/lib/domain/types';
import { ensureData } from '../../scripts/data/ensure';
import type { DataManifestFailure } from '../../scripts/data/generated-artifacts';

const manifest = { sourceCommit: 'a'.repeat(40) } as DataManifest;
const source = { root: 'test-data', commit: manifest.sourceCommit };

afterEach(() => vi.restoreAllMocks());

describe('data ensure validation reuse', () => {
  it('reuses a fully validated current cache without a second full validation', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sync = vi.fn();
    const validateArtifacts = vi.fn(async () => undefined);
    const result = await ensureData({
      readManifest: async () => manifest,
      validateCache: async () => true,
      resolveSource: async () => source,
      cacheMatchesSource: async () => true,
      ensureSearch: async () => false,
      sync,
      validateArtifacts
    });
    expect(result).toBe(manifest);
    expect(validateArtifacts).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '[deploy:cache] data result=hit reason=manifest-source-and-artifacts-match'
    );
  });

  it('regenerates an invalid cache and validates the replacement once', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const replacement = { ...manifest } as DataManifest;
    const sync = vi.fn(async () => replacement);
    const validateArtifacts = vi.fn(async () => undefined);
    const result = await ensureData({
      readManifest: async () => manifest,
      validateCache: async () => false,
      resolveSource: async () => source,
      cacheMatchesSource: async () => false,
      sync,
      ensureSearch: async () => false,
      validateArtifacts
    });
    expect(result).toBe(replacement);
    expect(sync).toHaveBeenCalledOnce();
    expect(validateArtifacts).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      '[deploy:cache] data result=miss reason=generated-artifacts-invalid'
    );
  });

  it('revalidates after search output changes and does not trust corrupt offline cache', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const refreshed = { ...manifest } as DataManifest;
    const validateArtifacts = vi.fn(async () => undefined);
    await ensureData({
      readManifest: async () => manifest,
      validateCache: async () => true,
      resolveSource: async () => source,
      cacheMatchesSource: async () => true,
      ensureSearch: async () => true,
      refreshMetadata: async () => refreshed,
      validateArtifacts
    });
    expect(validateArtifacts).toHaveBeenCalledWith(refreshed);
    expect(validateArtifacts).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      '[deploy:cache] data result=miss reason=manifest-source-and-artifacts-match+search-artifact-refreshed'
    );

    await expect(
      ensureData({
        env: {},
        readManifest: async () => manifest,
        validateCache: async () => false,
        resolveSource: async () => {
          throw new Error('offline');
        }
      })
    ).rejects.toThrow('offline');
  });

  it.each<DataManifestFailure>([
    'manifest-missing',
    'manifest-read-failed',
    'manifest-parse-failed',
    'manifest-schema-invalid'
  ])('reports %s without validating or comparing a nonexistent cache', async (reason) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const validateCache = vi.fn();
    const cacheMatchesSource = vi.fn();
    const sync = vi.fn(async () => manifest);
    const validateArtifacts = vi.fn(async () => {});
    await ensureData({
      readManifest: async (onFailure) => {
        onFailure?.(reason);
        throw new Error('fixture');
      },
      validateCache,
      cacheMatchesSource,
      resolveSource: async () => source,
      sync,
      validateArtifacts,
      ensureSearch: async () => false
    });
    expect(log).toHaveBeenCalledWith(`[deploy:cache] data result=miss reason=${reason}`);
    expect(validateCache).not.toHaveBeenCalled();
    expect(cacheMatchesSource).not.toHaveBeenCalled();
    expect(sync).toHaveBeenCalledOnce();
    expect(validateArtifacts).toHaveBeenCalledOnce();
  });

  it.each(['source-changed', 'textmap-changed'])(
    'reports %s using one source comparison',
    async (reason) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const validateCache = vi.fn(async () => true);
      // A false comparison can mean both changed; source takes precedence when SHAs differ.
      const cacheMatchesSource = vi.fn(async () => false);
      const sync = vi.fn(async () => manifest);
      const validateArtifacts = vi.fn(async () => {});
      await ensureData({
        readManifest: async () => manifest,
        validateCache,
        cacheMatchesSource,
        resolveSource: async () => ({
          ...source,
          commit: reason === 'source-changed' ? 'b'.repeat(40) : source.commit
        }),
        sync,
        validateArtifacts,
        ensureSearch: async () => false
      });
      expect(log).toHaveBeenCalledWith(`[deploy:cache] data result=miss reason=${reason}`);
      expect(validateCache).toHaveBeenCalledOnce();
      expect(cacheMatchesSource).toHaveBeenCalledOnce();
      expect(sync).toHaveBeenCalledOnce();
      expect(validateArtifacts).toHaveBeenCalledOnce();
    }
  );

  it.each([false, true])('preserves offline behavior (deployment=%s)', async (deployment) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sync = vi.fn();
    const validateArtifacts = vi.fn();
    const unavailable = new Error('source unavailable');
    const result = ensureData({
      env: { HSR_DEPLOYMENT_BUILD: deployment ? '1' : undefined },
      readManifest: async () => manifest,
      validateCache: async () => true,
      resolveSource: async () => {
        throw unavailable;
      },
      sync,
      validateArtifacts,
      ensureSearch: async () => false
    });
    if (deployment) await expect(result).rejects.toBe(unavailable);
    else {
      await expect(result).resolves.toBe(manifest);
      expect(log).toHaveBeenCalledWith(
        '[deploy:cache] data result=fallback reason=source-unavailable-valid-cache'
      );
    }
    expect(sync).not.toHaveBeenCalled();
    expect(validateArtifacts).not.toHaveBeenCalled();
  });
});
