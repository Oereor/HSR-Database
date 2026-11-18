import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertCheckout,
  prepareCheckout,
  publishCheckout,
  runGit,
  type GitCommandRunner
} from '../../scripts/deployment/git';
import { readRaw } from '../../scripts/data/raw';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

const temporaryDirectories: string[] = [];
const requiredPaths = ['required.json', 'nested/'];

async function fixtureRoot() {
  const root = await mkdtemp(path.resolve('data/audit/hsr-checkout-'));
  temporaryDirectories.push(root);
  return root;
}

async function upstreamFixture() {
  const root = await fixtureRoot();
  const source = path.join(root, 'upstream with spaces');
  await mkdir(path.join(source, 'nested'), { recursive: true });
  await writeFile(path.join(source, 'required.json'), '{}');
  await writeFile(path.join(source, 'nested', 'child file.json'), '{}');
  await writeFile(path.join(source, 'excluded.json'), '{}');
  git(source, 'init', '--quiet');
  git(source, 'config', 'uploadpack.allowFilter', 'true');
  git(source, 'add', '.');
  git(
    source,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture'
  );
  const commit = git(source, 'rev-parse', 'HEAD');
  const pin = { repository: pathToFileURL(source).href, commit };
  const cache = path.join(root, 'cache');
  const checkout = path.join(cache, 'source');
  return { pin, cache, checkout };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('deployment checkout preparation', () => {
  it('prepares and reuses a pinned sparse checkout, including file paths with spaces', async () => {
    const { pin, cache, checkout } = await upstreamFixture();
    expect(await prepareCheckout(checkout, pin, requiredPaths, cache)).toBe('materialized');
    expect((await readdir(checkout)).sort()).toEqual(['.git', 'nested', 'required.json']);
    expect(await readFile(path.join(checkout, 'nested', 'child file.json'), 'utf8')).toBe('{}');
    const runner = vi.fn(runGit);
    expect(await prepareCheckout(checkout, pin, requiredPaths, cache, runner)).toBe('reused');
    expect(runner.mock.calls.some(([args]) => args[0] === 'fetch')).toBe(false);
    expect(await readdir(cache)).toEqual(['source']);
  });

  it('requires the matching remote, HEAD, and sparse spec', async () => {
    const { pin, cache, checkout } = await upstreamFixture();
    await prepareCheckout(checkout, pin, requiredPaths, cache);
    await expect(
      assertCheckout(checkout, { ...pin, commit: '0'.repeat(40) }, requiredPaths)
    ).rejects.toThrow('remote or HEAD');
    await expect(
      assertCheckout(
        checkout,
        { ...pin, repository: 'https://example.invalid/repo.git' },
        requiredPaths
      )
    ).rejects.toThrow('remote or HEAD');
    await expect(assertCheckout(checkout, pin, ['required.json'])).rejects.toThrow(
      'sparse checkout specification mismatch'
    );
    await writeFile(path.join(checkout, 'required.json'), '{"changed":true}');
    await expect(assertCheckout(checkout, pin, requiredPaths)).rejects.toThrow(
      'working tree contains local changes'
    );
  });

  it('detects and replaces a checkout with a missing nested file hidden from Git status', async () => {
    const { pin, cache, checkout } = await upstreamFixture();
    await prepareCheckout(checkout, pin, requiredPaths, cache);
    git(checkout, 'update-index', '--skip-worktree', 'nested/child file.json');
    await rm(path.join(checkout, 'nested', 'child file.json'));
    expect(git(checkout, 'status', '--porcelain')).toBe('');
    await expect(assertCheckout(checkout, pin, requiredPaths)).rejects.toThrow(
      'required file is not materialized: nested/child file.json'
    );
    expect(await prepareCheckout(checkout, pin, requiredPaths, cache)).toBe('materialized');
    expect(await readFile(path.join(checkout, 'nested', 'child file.json'), 'utf8')).toBe('{}');
  });

  it('preserves the old checkout and another operation’s temporary directory after fetch fails', async () => {
    const { pin, cache, checkout } = await upstreamFixture();
    await prepareCheckout(checkout, pin, requiredPaths, cache);
    await mkdir(path.join(cache, '.tmp-other-active'));
    const runner: GitCommandRunner = (args, cwd) =>
      args[0] === 'fetch' ? Promise.reject(new Error('network disconnected')) : runGit(args, cwd);
    await expect(
      prepareCheckout(checkout, { ...pin, commit: '0'.repeat(40) }, requiredPaths, cache, runner)
    ).rejects.toThrow('network disconnected');
    await expect(assertCheckout(checkout, pin, requiredPaths)).resolves.toBeUndefined();
    expect((await readdir(cache)).sort()).toEqual(['.tmp-other-active', 'source']);
  }, 10_000);

  it('leaves a concurrent preparation’s staging directory alone', async () => {
    const { pin, cache, checkout } = await upstreamFixture();
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const runner: GitCommandRunner = async (args, cwd) => {
      if (args[0] === 'fetch') {
        ready.resolve();
        await release.promise;
      }
      return runGit(args, cwd);
    };
    const first = prepareCheckout(checkout, pin, requiredPaths, cache, runner);
    try {
      await Promise.race([ready.promise, first]);
      await expect(prepareCheckout(checkout, pin, requiredPaths, cache)).rejects.toThrow(
        'preparation is locked'
      );
      expect((await readdir(cache)).filter((entry) => entry.startsWith('.tmp-'))).toHaveLength(1);
    } finally {
      release.resolve();
      await first;
    }
    expect(await prepareCheckout(checkout, pin, requiredPaths, cache)).toBe('reused');
  });

  it('restores the previous directory if publishing the candidate fails', async () => {
    const root = await fixtureRoot();
    const checkout = path.join(root, 'checkout');
    const backup = path.join(root, 'previous');
    await mkdir(checkout);
    await writeFile(path.join(checkout, 'required.json'), '{}');
    await expect(
      publishCheckout(path.join(root, 'candidate'), checkout, backup)
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(checkout, 'required.json'), 'utf8')).toBe('{}');
    expect(await readdir(root)).toEqual(['checkout']);
  });

  it('reports subprocess status without printing URL arguments or raw stderr', async () => {
    const root = await fixtureRoot();
    const marker = 'fixture-secret-proxy-password';
    const location = pathToFileURL(path.join(root, marker)).href;
    const log = vi.spyOn(console, 'log');
    try {
      const failure = await runGit(['ls-remote', location, 'HEAD'], root).catch(
        (error: Error) => error
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toMatch(/ls-remote failed.*exit=128/);
      expect(String(failure)).not.toContain(marker);
      expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
    } finally {
      log.mockRestore();
    }
  });

  it('reports a missing materialized TurnBased source explicitly', async () => {
    const directory = await fixtureRoot();
    await expect(readRaw(directory, 'ExcelOutput/MissingTable.json')).rejects.toThrow(
      'Required TurnBased source file is not materialized: ExcelOutput/MissingTable.json'
    );
  });
});
