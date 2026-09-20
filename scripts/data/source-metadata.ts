import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sourceCommit } from './paths.js';

export interface GameVersionMetadata {
  gameVersionFull: string | null;
  gameVersion: string | null;
}

export interface PreparedSourceMetadata extends GameVersionMetadata {
  sourceCommit: string;
  sourceVersion: string;
}

const OSPROD_VERSION_PATTERN = /^OSPRODWin(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:_|$)/;

export function parseGameVersion(sourceVersion: string): GameVersionMetadata {
  const match = sourceVersion.match(OSPROD_VERSION_PATTERN);
  if (!match) return { gameVersionFull: null, gameVersion: null };
  const [, major, minor, patch] = match;
  return {
    gameVersionFull: `${major}.${minor}.${patch}`,
    gameVersion: `${major}.${minor}`
  };
}

export function readPreparedSourceMetadata(root: string): PreparedSourceMetadata {
  const commit = sourceCommit(root);
  const sourceVersion = execFileSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'log', '-1', '--pretty=%s'],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
  return { sourceCommit: commit, sourceVersion, ...parseGameVersion(sourceVersion) };
}

export function canonicalJsonDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function readTextMapWithDigest(
  root: string,
  textMapCode: string
): Promise<{ value: Record<string, string>; digest: string }> {
  const value = JSON.parse(
    await readFile(path.join(root, 'TextMap', `TextMap${textMapCode}.json`), 'utf8')
  ) as Record<string, string>;
  return { value, digest: canonicalJsonDigest(value) };
}
