import path from 'node:path';
import { readdir, rm } from 'node:fs/promises';
import { readUpstreamLock, type UpstreamLock } from './lock.js';
import { prepareCheckout, setSparseCheckout } from './git.js';
import {
  readAssetRequirements,
  readCharacterPreviewSources,
  readLightConePortraitSources,
  readLightConePreviewSources,
  readRelicPieceIconSources,
  readRelicPropertyIconSources,
  readRelicSetIconSources,
  ELEMENT_SOURCE_NAMES,
  PATH_SOURCE_NAMES,
  NAVIGATION_ICON_SOURCE_NAMES,
  BRAND_ICON_SOURCE_NAMES
} from '../assets/shared.js';
import { ENDGAME_MODE_META, ENDGAME_MODES } from '../../src/lib/domain/endgame-view.js';
import { NAVIGATION_ITEMS } from '../../src/lib/navigation.js';
import { BRAND_ICON_KEYS } from '../../src/lib/domain/visual-assets.js';

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

const indexPaths = [
  'index_new/cn/characters.json',
  'index_new/cn/light_cones.json',
  'index_new/cn/relic_sets.json',
  'index_new/cn/relics.json',
  'index_new/cn/properties.json'
];

const relative = (root: string, file: string): string =>
  path.relative(root, file).replaceAll('\\', '/');

function addSourcePaths(
  set: Set<string>,
  root: string,
  sources: ReadonlyMap<string, string>
): void {
  for (const source of sources.values()) set.add(relative(root, source));
}

export async function prepareTurnBasedGameData(lock: UpstreamLock): Promise<string> {
  const directory = path.join(upstreamRoot, 'TurnBasedGameData');
  console.log(`[upstream] TurnBasedGameData @ ${lock.turnBasedGameData.commit}`);
  await prepareCheckout(directory, lock.turnBasedGameData, turnBasedSparsePaths, upstreamRoot);
  return directory;
}

export async function prepareStarRailRes(lock: UpstreamLock): Promise<string> {
  const directory = path.join(upstreamRoot, 'StarRailRes');
  console.log(`[upstream] StarRailRes @ ${lock.starRailRes.commit}`);
  await prepareCheckout(directory, lock.starRailRes, indexPaths, upstreamRoot);

  const requirements = await readAssetRequirements();
  const paths = new Set(indexPaths);
  addSourcePaths(
    paths,
    directory,
    await readCharacterPreviewSources(directory, requirements.characterIds)
  );
  for (const id of requirements.characterIds) paths.add(`image/character_portrait/${id}.png`);
  addSourcePaths(
    paths,
    directory,
    await readLightConePreviewSources(directory, requirements.lightConeIds)
  );
  addSourcePaths(
    paths,
    directory,
    await readLightConePortraitSources(directory, requirements.lightConeIds)
  );
  addSourcePaths(
    paths,
    directory,
    await readRelicSetIconSources(directory, requirements.relicSetIds)
  );
  addSourcePaths(
    paths,
    directory,
    await readRelicPieceIconSources(directory, requirements.relicPieces)
  );
  addSourcePaths(
    paths,
    directory,
    await readRelicPropertyIconSources(directory, requirements.relicPropertyIcons)
  );
  for (const code of requirements.elements)
    paths.add(`icon/element/${ELEMENT_SOURCE_NAMES[code]}.png`);
  for (const code of requirements.paths) paths.add(`icon/path/${PATH_SOURCE_NAMES[code]}.png`);
  for (const item of NAVIGATION_ITEMS)
    paths.add(`icon/sign/${NAVIGATION_ICON_SOURCE_NAMES[item.iconKey]}.png`);
  for (const key of BRAND_ICON_KEYS) paths.add(`icon/sign/${BRAND_ICON_SOURCE_NAMES[key]}.png`);
  for (const mode of ENDGAME_MODES) paths.add(`icon/sign/${ENDGAME_MODE_META[mode].iconKey}.png`);

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
