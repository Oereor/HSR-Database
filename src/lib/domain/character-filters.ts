import type { CatalogEntry } from './types.js';

export type CharacterFilterState = {
  paths: Set<string>;
  elements: Set<string>;
  rarities: Set<string>;
};

export const readCharacterFilterState = (params: URLSearchParams): CharacterFilterState => ({
  paths: new Set(params.getAll('path').filter(Boolean)),
  elements: new Set(params.getAll('element').filter(Boolean)),
  rarities: new Set(params.getAll('rarity').filter(Boolean))
});

export function matchesCharacterFilters(entry: CatalogEntry, state: CharacterFilterState): boolean {
  const pathMatch =
    state.paths.size === 0 || (entry.path !== undefined && state.paths.has(entry.path));
  const elementMatch =
    state.elements.size === 0 || (entry.element !== undefined && state.elements.has(entry.element));
  const rarityMatch =
    state.rarities.size === 0 ||
    (entry.rarity !== undefined && state.rarities.has(String(entry.rarity)));
  return pathMatch && elementMatch && rarityMatch;
}

export function writeCharacterFilterState(
  params: URLSearchParams,
  state: CharacterFilterState
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['path', 'element', 'rarity']) next.delete(key);
  for (const value of state.paths) next.append('path', value);
  for (const value of state.elements) next.append('element', value);
  for (const value of state.rarities) next.append('rarity', value);
  next.delete('page');
  return next;
}

export const hasCharacterFilters = (state: CharacterFilterState): boolean =>
  state.paths.size > 0 || state.elements.size > 0 || state.rarities.size > 0;
