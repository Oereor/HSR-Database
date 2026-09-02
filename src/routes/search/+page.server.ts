import { getEnemyPortraitMap } from '$lib/server/enemy-assets';
import {
  getCatalog,
  getEnemyCatalog,
  getRelicCatalog,
  getSearchIndex
} from '$lib/server/generated';

export const prerender = true;

export async function load() {
  const [searchIndex, characters, lightCones, relics, enemies, portraitMap] = await Promise.all([
    getSearchIndex(),
    getCatalog('characters'),
    getCatalog('light-cones'),
    getRelicCatalog(),
    getEnemyCatalog(),
    getEnemyPortraitMap()
  ]);
  const enemyIds = new Set(enemies.map((entry) => entry.id));
  const enemyPortraits = Object.fromEntries(
    [...portraitMap.entries()]
      .map(([id, url]) => [String(id), url] as const)
      .filter(([id]) => enemyIds.has(id))
  );

  return { searchIndex, characters, lightCones, relics, enemies, enemyPortraits };
}
