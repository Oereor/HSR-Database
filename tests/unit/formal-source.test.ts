import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpstreamLock } from '../../scripts/deployment/lock';
import { resolveFormalDataSource } from '../../scripts/deployment/formal-source';
import { runPrebuild } from '../../scripts/deployment/prebuild';
import { siteRoot } from '../../scripts/data/paths';

const { prepare, assertRoot, readCommit } = vi.hoisted(() => ({
  prepare: vi.fn(),
  assertRoot: vi.fn(),
  readCommit: vi.fn()
}));

vi.mock('../../scripts/deployment/prepare', () => ({ prepareTurnBasedGameData: prepare }));
vi.mock('../../scripts/data/paths', async (original) => ({
  ...(await original<typeof import('../../scripts/data/paths')>()),
  assertDataRoot: assertRoot,
  sourceCommit: readCommit
}));

const commit = 'a'.repeat(40);
const lock: UpstreamLock = {
  schemaVersion: 1,
  turnBasedGameData: { repository: 'https://example.test/data.git', commit },
  starRailRes: { repository: 'https://example.test/assets.git', commit: 'c'.repeat(40) }
};
const preparedRoot = path.join(siteRoot, '.upstream/TurnBasedGameData');

beforeEach(() => {
  vi.resetAllMocks();
  prepare.mockResolvedValue({ directory: preparedRoot });
  assertRoot.mockImplementation((root: string) => root);
  readCommit.mockReturnValue(commit);
});

describe('formal data source', () => {
  it.each([undefined, '', ' \t '])('prepares the lock when HSR_DATA_ROOT is %j', async (value) => {
    await expect(resolveFormalDataSource(lock, { HSR_DATA_ROOT: value })).resolves.toEqual({
      root: preparedRoot,
      commit
    });
    expect(prepare).toHaveBeenCalledExactlyOnceWith(lock);
    expect(assertRoot).toHaveBeenCalledExactlyOnceWith(preparedRoot);
    expect(readCommit).toHaveBeenCalledExactlyOnceWith(preparedRoot);
  });

  it('preserves an explicit matching checkout without preparing or switching it', async () => {
    const configured = '../explicit-source';
    const root = path.resolve(siteRoot, configured);
    await expect(
      resolveFormalDataSource(lock, { HSR_DATA_ROOT: ` ${configured} ` })
    ).resolves.toEqual({
      root,
      commit
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(assertRoot).toHaveBeenCalledWith(root);
  });

  it('rejects an explicit wrong commit before any prebuild command runs', async () => {
    const run = vi.fn();
    const actual = 'b'.repeat(40);
    readCommit.mockReturnValue(actual);
    const error = await runPrebuild({
      env: { HSR_DATA_ROOT: '../explicit-source' },
      readLock: async () => lock,
      run
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(path.resolve(siteRoot, '../explicit-source'));
    expect((error as Error).message).toContain(actual);
    expect((error as Error).message).toContain(commit);
    expect(prepare).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('does not fall back when preparing the locked source fails', async () => {
    const error = new Error('synthetic upstream unavailable');
    prepare.mockRejectedValue(error);
    await expect(resolveFormalDataSource(lock, {})).rejects.toMatchObject({ cause: error });
    expect(assertRoot).not.toHaveBeenCalled();
    expect(readCommit).not.toHaveBeenCalled();
  });

  it('rejects an incomplete explicit source without preparing an alternative', async () => {
    const error = new Error('synthetic required table missing');
    assertRoot.mockImplementation(() => {
      throw error;
    });
    await expect(
      resolveFormalDataSource(lock, { HSR_DATA_ROOT: 'incomplete' })
    ).rejects.toMatchObject({ cause: error });
    expect(prepare).not.toHaveBeenCalled();
    expect(readCommit).not.toHaveBeenCalled();
  });
});

describe('formal prebuild', () => {
  it('uses the same verified data source for all steps and preserves the asset environment', async () => {
    const env = { HSR_ASSET_ROOT: '../explicit-assets', TEST_VALUE: 'preserved' };
    const run = vi.fn<(args: string[], env: NodeJS.ProcessEnv) => Promise<void>>(async () => {});
    await runPrebuild({ env, readLock: async () => lock, run });
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ['messages:compile'],
      ['data:ensure'],
      ['assets:ensure'],
      ['relic-score:v2:benchmarks:validate']
    ]);
    for (const [, childEnv] of run.mock.calls)
      expect(childEnv).toEqual({
        ...env,
        HSR_DATA_ROOT: preparedRoot,
        HSR_EXPECTED_DATA_COMMIT: commit
      });
    expect(env).not.toHaveProperty('HSR_DATA_ROOT');
  });

  it('does not continue after data preparation fails', async () => {
    const error = new Error('synthetic generation failure');
    const run = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
    await expect(runPrebuild({ env: {}, readLock: async () => lock, run })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
