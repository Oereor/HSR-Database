import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDataManifest } from '../../scripts/data/generated-artifacts';
import { readAssetManifest } from '../../scripts/assets/shared';

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  readFile: vi.fn()
}));

beforeEach(() => vi.resetAllMocks());

describe('manifest diagnostics preserve read contracts', () => {
  it.each(['ENOENT', 'EACCES'])(
    'classifies %s from the single read and preserves the original error',
    async (code) => {
      const error = Object.assign(new Error('fixture'), { code });
      const reason = code === 'ENOENT' ? 'manifest-missing' : 'manifest-read-failed';
      vi.mocked(readFile).mockRejectedValue(error);
      const report = vi.fn();
      await expect(readDataManifest('fixture', report)).rejects.toBe(error);
      expect(readFile).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledExactlyOnceWith(reason);
      vi.clearAllMocks();
      await expect(readAssetManifest(report)).resolves.toBeUndefined();
      expect(readFile).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledExactlyOnceWith(reason);
    }
  );

  it('distinguishes JSON parsing from schema validation without a reread', async () => {
    const report = vi.fn();
    vi.mocked(readFile).mockResolvedValue('{');
    await expect(readDataManifest('fixture', report)).rejects.toBeInstanceOf(SyntaxError);
    expect(readFile).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith('manifest-parse-failed');
    vi.clearAllMocks();
    await expect(readAssetManifest(report)).resolves.toBeUndefined();
    expect(readFile).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith('manifest-parse-failed');
    vi.clearAllMocks();
    vi.mocked(readFile).mockResolvedValue('{"schemaVersion":0}');
    await expect(readDataManifest('fixture', report)).rejects.toThrow(
      'Unsupported generated data manifest schema'
    );
    expect(readFile).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith('manifest-schema-invalid');
    vi.clearAllMocks();
    // The assets reader has never validated schema; ensure owns that later check.
    await expect(readAssetManifest(report)).resolves.toEqual({ schemaVersion: 0 });
    expect(readFile).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
  });
});
