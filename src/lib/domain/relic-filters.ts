import type { RelicCatalogEntry, RelicSetCategory } from './types.js';

export type RelicFilterState = {
  category: RelicSetCategory | undefined;
};

export const isRelicSetCategory = (value: string | undefined): value is RelicSetCategory =>
  value === 'cavern' || value === 'planar';

export const readRelicFilterState = (params: URLSearchParams): RelicFilterState => ({
  category: params.getAll('type').find(isRelicSetCategory)
});

export function matchesRelicFilters(entry: RelicCatalogEntry, state: RelicFilterState): boolean {
  return state.category === undefined || entry.category === state.category;
}

export function writeRelicFilterState(
  params: URLSearchParams,
  state: RelicFilterState
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('type');
  if (state.category) next.set('type', state.category);
  next.delete('page');
  return next;
}

export const hasRelicFilters = (state: RelicFilterState): boolean => state.category !== undefined;
