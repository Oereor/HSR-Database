import { ChildProcess, spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteRoot } from '../../scripts/data/paths';
import { runPnpm } from '../../scripts/deployment/run-pnpm';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn()
}));

describe('runPnpm', () => {
  let child: ChildProcess;

  beforeEach(() => {
    child = new ChildProcess();
    vi.mocked(spawn).mockReset().mockReturnValue(child);
  });

  it.each([
    { entrypoint: '/pnpm install/pnpm', useNode: false },
    { entrypoint: 'C:\\pnpm install\\pnpm.exe', useNode: false },
    { entrypoint: '/pnpm install/pnpm.js', useNode: true },
    { entrypoint: '/pnpm install/pnpm.cjs', useNode: true },
    { entrypoint: '/pnpm install/pnpm.mjs', useNode: true },
    { entrypoint: undefined, useNode: false }
  ])('starts pnpm from $entrypoint', async ({ entrypoint, useNode }) => {
    const env = { npm_execpath: entrypoint, HSR_DATA_ROOT: '/pinned/data' };
    const args = ['exec', 'vite', 'build'];
    const result = runPnpm(args, env);

    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      useNode ? process.execPath : (entrypoint ?? 'pnpm'),
      useNode ? [entrypoint, ...args] : args,
      { cwd: siteRoot, env, shell: false, stdio: 'inherit', windowsHide: true }
    );
    child.emit('close', 0, null);
    await expect(result).resolves.toBeUndefined();
  });

  it('propagates a launch error', async () => {
    const result = runPnpm(['messages:compile'], {});
    const error = new Error('pnpm executable is missing');
    child.emit('error', error);
    await expect(result).rejects.toBe(error);
  });

  it.each([
    { code: 2, signal: null, status: '2' },
    { code: null, signal: 'SIGTERM', status: 'SIGTERM' }
  ])('rejects when pnpm exits with $status', async ({ code, signal, status }) => {
    const result = runPnpm(['messages:compile'], {});
    child.emit('close', code, signal);
    await expect(result).rejects.toThrow(`messages:compile failed (${status})`);
  });
});
