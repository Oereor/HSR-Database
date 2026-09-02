import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCheckout,
  inspectCheckout,
  setSparseCheckout,
  type GitCommandRunner
} from '../../scripts/deployment/git';

const pin = {
  repository: 'https://github.com/DimbreathBot/TurnBasedGameData.git',
  commit: '014e33e2404f8cd668bf06fc2ea6db53b6bc3992'
};

const temporaryDirectories: string[] = [];

async function checkoutFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-deployment-git-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, '.git'));
  await writeFile(path.join(root, 'required.json'), '{}');
  return root;
}

const runner =
  (remote = pin.repository, head = pin.commit, sparse = true): GitCommandRunner =>
  async (args) => {
    if (args.includes('remote.origin.url')) return remote;
    if (args.includes('core.sparseCheckout')) return sparse ? 'true' : 'false';
    if (args[0] === 'rev-parse') return head;
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

describe('deployment checkout validation', () => {
  it('accepts exact remote, HEAD and required paths', async () => {
    const directory = await checkoutFixture();
    await expect(
      assertCheckout(directory, pin, ['required.json'], runner())
    ).resolves.toBeUndefined();
  });

  it('rejects source URL and HEAD mismatches', async () => {
    const directory = await checkoutFixture();
    await expect(
      inspectCheckout(directory, pin, runner('https://example.invalid/repo.git'))
    ).resolves.toBe(false);
    await expect(
      inspectCheckout(directory, pin, runner(pin.repository, '0'.repeat(40)))
    ).resolves.toBe(false);
  });

  it('rejects missing sparse paths loudly', async () => {
    const directory = await checkoutFixture();
    await expect(assertCheckout(directory, pin, ['missing.json'], runner())).rejects.toThrow(
      /缺少必需路径/
    );
  });

  it('rejects a checkout without sparse configuration', async () => {
    const directory = await checkoutFixture();
    await expect(
      assertCheckout(directory, pin, ['required.json'], runner(pin.repository, pin.commit, false))
    ).rejects.toThrow(/sparse checkout 配置缺失/);
  });

  it('passes anchored sparse paths as an argument array', async () => {
    const calls: string[][] = [];
    await setSparseCheckout(
      'checkout',
      ['index_new/cn/characters.json', '/image/icon.png'],
      async (args) => {
        calls.push(args);
        return '';
      }
    );
    expect(calls).toEqual([
      ['sparse-checkout', 'set', '--no-cone', '/index_new/cn/characters.json', '/image/icon.png']
    ]);
  });

  it('preserves the Git failure after three retries', async () => {
    let attempts = 0;
    await expect(
      setSparseCheckout('checkout', ['required.json'], async () => {
        attempts += 1;
        throw new Error('network disconnected');
      })
    ).rejects.toThrow(/network disconnected/);
    expect(attempts).toBe(3);
  });
});
