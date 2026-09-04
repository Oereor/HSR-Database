import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CharacterNameSnapshot } from '../../src/lib/search/name-metadata.js';
import { readUpstreamLock } from '../deployment/lock.js';
import { prepareTurnBasedGameData } from '../deployment/prepare.js';
import { deriveCharacterNames } from './character-names.js';
import { siteRoot, sourceCommit } from './paths.js';

export const officialSnapshotPath = path.join(
  siteRoot,
  'data/search/character-official-names.generated.json'
);
export const serializeCharacterNames = (snapshot: CharacterNameSnapshot): string =>
  `${JSON.stringify(snapshot, null, 2)}\n`;

export async function checkOfficialSnapshot(
  snapshot: CharacterNameSnapshot,
  file = officialSnapshotPath
): Promise<void> {
  const current = await readFile(file, 'utf8').catch(() => '');
  if (current !== serializeCharacterNames(snapshot))
    throw new Error(
      '官方角色名称快照已过期或缺失。请运行 pnpm data:search-names:update，并审阅名称 diff。'
    );
}

export async function runSearchNames(mode: 'check' | 'update'): Promise<void> {
  const lock = await readUpstreamLock(siteRoot);
  // Only deployment may supply a prepared root; it must still match the lock.
  const root =
    process.env.HSR_DEPLOYMENT_BUILD === '1' && process.env.HSR_DATA_ROOT
      ? path.resolve(siteRoot, process.env.HSR_DATA_ROOT)
      : await prepareTurnBasedGameData(lock);
  const commit = sourceCommit(root);
  if (commit !== lock.turnBasedGameData.commit)
    throw new Error('角色名称生成源与 pinned upstream SHA 不一致');
  const { snapshot } = await deriveCharacterNames(root, commit);
  if (mode === 'update')
    await writeFile(officialSnapshotPath, serializeCharacterNames(snapshot), 'utf8');
  else await checkOfficialSnapshot(snapshot);
  console.log(
    `官方角色名称 ${mode} 完成：${Object.keys(snapshot.characters).length} AvatarIDs @ ${commit.slice(0, 12)}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const mode = process.argv[2];
  if (mode !== 'check' && mode !== 'update') throw new Error('用法：search-names.ts check|update');
  await runSearchNames(mode);
}
