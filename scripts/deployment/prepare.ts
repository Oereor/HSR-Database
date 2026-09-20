import path from 'node:path';
import { readdir, rm } from 'node:fs/promises';
import { TURN_BASED_DEPLOYMENT_PATHS } from '../data/source-requirements.js';
import { readUpstreamLock, type UpstreamLock } from './lock.js';
import { prepareCheckout, type CheckoutPreparationResult } from './git.js';
import { summarizeDirectory, type FileSummary } from './telemetry.js';

export const siteRoot = path.resolve(import.meta.dirname, '..', '..');
export const resolveUpstreamRoot = (root: string): string => path.resolve(root, '.upstream');
export const upstreamRoot = resolveUpstreamRoot(siteRoot);

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
  'icon/sign/',
  'icon/avatar/'
];

export const starRailSparsePaths = [...starRailIndexPaths, ...starRailAssetDirectories];

export interface PreparedUpstream {
  directory: string;
  result: CheckoutPreparationResult;
  summary: FileSummary;
}

async function preparedUpstream(
  directory: string,
  result: CheckoutPreparationResult
): Promise<PreparedUpstream> {
  const summary = await summarizeDirectory(directory, new Set(['.git']));
  return { directory, result, summary };
}

export async function prepareTurnBasedGameData(lock: UpstreamLock): Promise<PreparedUpstream> {
  const directory = path.join(upstreamRoot, 'TurnBasedGameData');
  console.log(`[upstream] TurnBasedGameData @ ${lock.turnBasedGameData.commit}`);
  const result = await prepareCheckout(
    directory,
    lock.turnBasedGameData,
    TURN_BASED_DEPLOYMENT_PATHS,
    upstreamRoot
  );
  return preparedUpstream(directory, result);
}

export async function prepareStarRailRes(lock: UpstreamLock): Promise<PreparedUpstream> {
  const directory = path.join(upstreamRoot, 'StarRailRes');
  console.log(`[upstream] StarRailRes @ ${lock.starRailRes.commit}`);
  const result = await prepareCheckout(
    directory,
    lock.starRailRes,
    starRailSparsePaths,
    upstreamRoot
  );
  return preparedUpstream(directory, result);
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
