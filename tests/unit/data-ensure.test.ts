import { describe, expect, it, vi } from 'vitest';
import type { DataManifest } from '../../src/lib/domain/types';
import { ensureData } from '../../scripts/data/ensure';

const manifest = { sourceCommit: 'a'.repeat(40) } as DataManifest;
const source = { root: 'test-data', commit: manifest.sourceCommit };

describe('data ensure validation reuse', () => {
  it('reuses a fully validated current cache without a second full validation', async () => {
    const validateArtifacts = vi.fn(async () => undefined);
    const result = await ensureData({
      readManifest: async () => manifest,
      validateCache: async () => true,
      resolveSource: async () => source,
      cacheMatchesSource: async () => true,
      ensureSearch: async () => false,
      validateArtifacts
    });
    expect(result).toBe(manifest);
    expect(validateArtifacts).not.toHaveBeenCalled();
  });

  it('regenerates an invalid cache and validates the replacement once', async () => {
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
  });

  it('revalidates after search output changes and does not trust corrupt offline cache', async () => {
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
});
