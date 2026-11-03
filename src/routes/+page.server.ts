import {
  getCatalog,
  getRelicCatalog,
  getEnemyCatalog,
  getHomepageVersionData
} from '$lib/server/generated';
import { getEnemyPortraitUrl } from '$lib/server/enemy-assets';

function resolve<T extends { id: string }>(ids: string[], catalog: T[]): T[] {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  return ids.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`Homepage references missing catalog entity ${id}`);
    return entry;
  });
}
export async function load({ locals }) {
  const locale = locals.locale;
  const [homepage, characters, lightCones, relics, enemies] = await Promise.all([
    getHomepageVersionData(locale),
    getCatalog(locale, 'characters'),
    getCatalog(locale, 'light-cones'),
    getRelicCatalog(locale),
    getEnemyCatalog(locale)
  ]);
  const newEnemies = resolve(homepage.additions.enemies, enemies);
  return {
    homepage,
    newCharacters: resolve(homepage.additions.characters, characters),
    newLightCones: resolve(homepage.additions['light-cones'], lightCones),
    newRelics: resolve(homepage.additions.relics, relics),
    newEnemies: newEnemies.slice(0, 6),
    enemyPortraits: Object.fromEntries(
      await Promise.all(
        newEnemies
          .slice(0, 6)
          .map(async (entry) => [entry.id, await getEnemyPortraitUrl(Number(entry.id))])
      )
    )
  };
}
