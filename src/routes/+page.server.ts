import { getCatalog, getManifest } from '$lib/server/generated';

export async function load() {
  const [manifest, characters] = await Promise.all([getManifest(), getCatalog('characters')]);
  return {
    manifest,
    featured: characters
      .filter((item) => item.rarity === 5)
      .slice(-8)
      .reverse()
  };
}
