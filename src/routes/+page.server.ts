import type { CatalogEntry } from '$lib/domain/types';
import { getCatalog, getHomepageRecentWarps, getManifest } from '$lib/server/generated';

function resolveEntries(
  records: Array<{ id: string; gachaId: number }>,
  catalog: CatalogEntry[],
  label: string
): CatalogEntry[] {
  const entries = new Map(catalog.map((entry) => [entry.id, entry]));
  return records.map((record) => {
    const entry = entries.get(record.id);
    if (!entry)
      throw new Error(`Homepage ${label}跃迁 ${record.gachaId} 无法连接目录实体 ${record.id}`);
    return entry;
  });
}

export async function load() {
  const [manifest, homepage, characters, lightCones] = await Promise.all([
    getManifest(),
    getHomepageRecentWarps(),
    getCatalog('characters'),
    getCatalog('light-cones')
  ]);
  return {
    manifest,
    recentCharacters: resolveEntries(
      homepage.avatarUps.map((record) => ({ id: record.avatarId, gachaId: record.gachaId })),
      characters,
      '角色'
    ),
    recentLightCones: resolveEntries(
      homepage.weaponUps.map((record) => ({ id: record.equipmentId, gachaId: record.gachaId })),
      lightCones,
      '光锥'
    )
  };
}
