import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitCommandRunner } from '../../scripts/deployment/git';
import {
  compareAndUpdateLock,
  parseLsRemoteHead,
  updateUpstreamLockFile
} from '../../scripts/update-upstream-lock';

const turnOld = '1'.repeat(40);
const turnNew = '2'.repeat(40);
const assetsOld = 'a'.repeat(40);
const assetsNew = 'b'.repeat(40);
const valid = {
  schemaVersion: 1,
  turnBasedGameData: {
    repository: 'https://github.com/DimbreathBot/TurnBasedGameData.git',
    commit: turnOld
  },
  starRailRes: {
    repository: 'https://github.com/Mar-7th/StarRailRes.git',
    commit: assetsOld
  }
};
const temporaryDirectories: string[] = [];

async function fixture(lock: unknown = valid): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-upstream-update-'));
  temporaryDirectories.push(root);
  await writeFile(path.join(root, 'upstream.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  return root;
}

function runner(turnSha = turnOld, assetsSha = assetsOld): GitCommandRunner {
  return async (args) => {
    const repository = args[1];
    if (repository === valid.turnBasedGameData.repository) return `${turnSha}\tHEAD`;
    if (repository === valid.starRailRes.repository) return `${assetsSha}\tHEAD`;
    throw new Error(`unexpected repository: ${repository}`);
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

describe('upstream lock updater', () => {
  it('does not write when both upstreams are unchanged', async () => {
    const root = await fixture();
    const writes: string[] = [];
    const result = await updateUpstreamLockFile(root, runner(), async (file) => {
      writes.push(file);
    });
    expect(result.changed).toBe(false);
    expect(result.updates.every((entry) => !entry.changed)).toBe(true);
    expect(writes).toEqual([]);
  });

  it.each([
    ['TurnBasedGameData only', turnNew, assetsOld, [true, false]],
    ['StarRailRes only', turnOld, assetsNew, [false, true]],
    ['both upstreams', turnNew, assetsNew, [true, true]]
  ] as const)('updates %s', async (_, turnSha, assetsSha, expectedChanges) => {
    const root = await fixture();
    const result = await updateUpstreamLockFile(root, runner(turnSha, assetsSha));
    expect(result.changed).toBe(true);
    expect(result.updates.map((entry) => entry.changed)).toEqual(expectedChanges);
    expect(JSON.parse(await readFile(path.join(root, 'upstream.lock.json'), 'utf8'))).toEqual(
      result.lock
    );
  });

  it('preserves schema, field order, two-space indentation and trailing newline', async () => {
    const root = await fixture();
    await updateUpstreamLockFile(root, runner(turnNew, assetsOld));
    const text = await readFile(path.join(root, 'upstream.lock.json'), 'utf8');
    expect(text).toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          turnBasedGameData: { ...valid.turnBasedGameData, commit: turnNew },
          starRailRes: valid.starRailRes
        },
        null,
        2
      )}\n`
    );
  });

  it.each([
    ['malformed lock', { ...valid, schemaVersion: 2 }],
    [
      'wrong repository',
      { ...valid, turnBasedGameData: { ...valid.turnBasedGameData, repository: 'wrong' } }
    ],
    ['incomplete SHA', { ...valid, starRailRes: { ...valid.starRailRes, commit: 'abc' } }]
  ])('rejects %s before querying', async (_, lock) => {
    const root = await fixture(lock);
    let queried = false;
    await expect(
      updateUpstreamLockFile(root, async () => {
        queried = true;
        return '';
      })
    ).rejects.toThrow(/lock 无效/);
    expect(queried).toBe(false);
  });

  it('rejects invalid JSON before querying', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'upstream.lock.json'), '{');
    await expect(updateUpstreamLockFile(root, runner())).rejects.toThrow(/无法读取/);
  });

  it('does not write when a query fails after another query succeeds', async () => {
    const root = await fixture();
    const writes: string[] = [];
    await expect(
      updateUpstreamLockFile(
        root,
        async (args) => {
          if (args[1] === valid.turnBasedGameData.repository) return `${turnNew}\tHEAD`;
          throw new Error('network unavailable');
        },
        async (file) => {
          writes.push(file);
        }
      )
    ).rejects.toThrow(/network unavailable/);
    expect(writes).toEqual([]);
  });

  it.each([
    '',
    'not-a-sha\tHEAD',
    `${turnNew}\trefs/heads/main`,
    `${turnNew}\tHEAD\n${assetsNew}\tHEAD`
  ])('rejects invalid ls-remote output %j', (output) => {
    expect(() => parseLsRemoteHead(output)).toThrow(/ls-remote/);
  });

  it('normalizes valid uppercase SHAs', () => {
    expect(parseLsRemoteHead(`${assetsNew.toUpperCase()}\tHEAD`)).toBe(assetsNew);
  });

  it('rejects invalid injected latest SHAs', () => {
    expect(() =>
      compareAndUpdateLock(valid, { turnBasedGameData: 'HEAD', starRailRes: assetsOld })
    ).toThrow(/最新 SHA 无效/);
  });
});
