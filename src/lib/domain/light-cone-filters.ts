import type { CatalogEntry } from './types.js';

export type LightConeFilterState = {
  paths: Set<string>;
  rarities: Set<string>;
};

export const readLightConeFilterState = (params: URLSearchParams): LightConeFilterState => ({
  paths: new Set(params.getAll('path').filter(Boolean)),
  rarities: new Set(params.getAll('rarity').filter(Boolean))
});

export function matchesLightConeFilters(entry: CatalogEntry, state: LightConeFilterState): boolean {
  const pathMatch =
    state.paths.size === 0 || (entry.path !== undefined && state.paths.has(entry.path));
  const rarityMatch =
    state.rarities.size === 0 ||
    (entry.rarity !== undefined && state.rarities.has(String(entry.rarity)));
  return pathMatch && rarityMatch;
}

export function writeLightConeFilterState(
  params: URLSearchParams,
  state: LightConeFilterState
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['path', 'rarity']) next.delete(key);
  for (const value of state.paths) next.append('path', value);
  for (const value of state.rarities) next.append('rarity', value);
  next.delete('page');
  return next;
}

export const hasLightConeFilters = (state: LightConeFilterState): boolean =>
  state.paths.size > 0 || state.rarities.size > 0;
