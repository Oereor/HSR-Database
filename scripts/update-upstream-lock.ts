import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  LOCK_FILE,
  parseUpstreamLock,
  readUpstreamLock,
  type UpstreamLock
} from './deployment/lock.js';
import { runGit, type GitCommandRunner } from './deployment/git.js';

export type UpstreamName = 'turnBasedGameData' | 'starRailRes';

export interface UpstreamUpdate {
  name: UpstreamName;
  repository: string;
  pinnedSha: string;
  latestSha: string;
  changed: boolean;
}

export interface UpstreamUpdateResult {
  lock: UpstreamLock;
  updates: UpstreamUpdate[];
  changed: boolean;
}

export type LockWriter = (file: string, contents: string) => Promise<void>;

const upstreamNames: UpstreamName[] = ['turnBasedGameData', 'starRailRes'];

export function parseLsRemoteHead(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error('[upstream] git ls-remote 返回格式异常');
  const match = /^([0-9a-f]{40})\s+HEAD$/i.exec(lines[0]);
  if (!match) throw new Error('[upstream] git ls-remote 返回空值或非法 SHA');
  return match[1].toLowerCase();
}

export function compareAndUpdateLock(
  value: unknown,
  latest: Record<UpstreamName, string>
): UpstreamUpdateResult {
  const lock = parseUpstreamLock(value);
  const updates = upstreamNames.map((name) => {
    const latestSha = latest[name];
    if (typeof latestSha !== 'string' || !/^[0-9a-f]{40}$/i.test(latestSha))
      throw new Error(`[upstream] ${name} 最新 SHA 无效`);
    const normalizedLatest = latestSha.toLowerCase();
    return {
      name,
      repository: lock[name].repository,
      pinnedSha: lock[name].commit,
      latestSha: normalizedLatest,
      changed: lock[name].commit !== normalizedLatest
    };
  });
  const next: UpstreamLock = {
    schemaVersion: lock.schemaVersion,
    turnBasedGameData: {
      repository: lock.turnBasedGameData.repository,
      commit: updates[0].latestSha
    },
    starRailRes: {
      repository: lock.starRailRes.repository,
      commit: updates[1].latestSha
    }
  };
  return { lock: next, updates, changed: updates.some((entry) => entry.changed) };
}

export async function updateUpstreamLockFile(
  siteRoot: string,
  runner: GitCommandRunner = runGit,
  writer: LockWriter = (file, contents) => writeFile(file, contents, 'utf8')
): Promise<UpstreamUpdateResult> {
  const lock = await readUpstreamLock(siteRoot);
  const latestEntries = await Promise.all(
    upstreamNames.map(async (name) => {
      const output = await runner(['ls-remote', lock[name].repository, 'HEAD']);
      return [name, parseLsRemoteHead(output)] as const;
    })
  );
  const latest = Object.fromEntries(latestEntries) as Record<UpstreamName, string>;
  const result = compareAndUpdateLock(lock, latest);
  for (const entry of result.updates) {
    console.log(`[upstream] ${entry.name}`);
    console.log(`  pinned: ${entry.pinnedSha}`);
    console.log(`  latest: ${entry.latestSha}`);
    console.log(`  update: ${entry.changed ? 'yes' : 'no'}`);
  }
  if (result.changed) {
    const file = path.join(siteRoot, LOCK_FILE);
    await writer(file, `${JSON.stringify(result.lock, null, 2)}\n`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootArgument = process.argv.slice(2).find((argument) => argument !== '--');
  const siteRoot = rootArgument ? path.resolve(rootArgument) : process.cwd();
  updateUpstreamLockFile(siteRoot).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
