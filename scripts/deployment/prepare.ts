import path from 'node:path';
import { readdir, rm } from 'node:fs/promises';
import { readUpstreamLock, type UpstreamLock } from './lock.js';
import { prepareCheckout, setSparseCheckout } from './git.js';

export const siteRoot = path.resolve(import.meta.dirname, '..', '..');
export const resolveUpstreamRoot = (root: string): string => path.resolve(root, '.upstream');
export const upstreamRoot = resolveUpstreamRoot(siteRoot);

const turnBasedSparsePaths = [
  'ExcelOutput/',
  'TextMap/TextMapCHS.json',
  'Config/ConfigCharacter/Monster/',
  'Config/ConfigAbility/Monster/',
  'Config/ConfigAbility/BattleEvent/'
];

export const starRailIndexPaths = [
  'index_new/cn/characters.json',
  'index_new/cn/light_cones.json',
  'index_new/cn/relic_sets.json',
  'index_new/cn/relics.json',
  'index_new/cn/properties.json',
  'index_new/cn/character_skills.json',
  'index_new/cn/character_skill_trees.json',
  'index_new/cn/character_ranks.json'
];

export const starRailAssetDirectories = [
  'image/character_preview/',
  'image/character_portrait/',
  'image/light_cone_preview/',
  'image/light_cone_portrait/',
  'icon/relic/',
  'icon/property/',
  'icon/skill/',
  'icon/element/',
  'icon/path/',
  'icon/sign/'
];

export async function prepareTurnBasedGameData(lock: UpstreamLock): Promise<string> {
  const directory = path.join(upstreamRoot, 'TurnBasedGameData');
  console.log(`[upstream] TurnBasedGameData @ ${lock.turnBasedGameData.commit}`);
  await prepareCheckout(directory, lock.turnBasedGameData, turnBasedSparsePaths, upstreamRoot);
  return directory;
}

export async function prepareStarRailRes(lock: UpstreamLock): Promise<string> {
  const directory = path.join(upstreamRoot, 'StarRailRes');
  console.log(`[upstream] StarRailRes @ ${lock.starRailRes.commit}`);
  await prepareCheckout(directory, lock.starRailRes, starRailIndexPaths, upstreamRoot);

  const paths = new Set([...starRailIndexPaths, ...starRailAssetDirectories]);

  await setSparseCheckout(directory, paths);
  for (const required of paths) {
    const full = path.join(directory, required);
    try {
      await import('node:fs/promises').then(({ access }) => access(full));
    } catch {
      // Missing optional assets are handled by the existing assets pipeline's fallback manifest.
    }
  }
  return directory;
}

export async function loadDeploymentLock(): Promise<UpstreamLock> {
  console.log('[upstream] loading lock');
  try {
    const entries = await readdir(upstreamRoot, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('.tmp-'))
        .map((entry) => rm(path.join(upstreamRoot, entry.name), { recursive: true, force: true }))
    );
  } catch {
    // The directory is created lazily by the first checkout.
  }
  return readUpstreamLock(siteRoot);
}
