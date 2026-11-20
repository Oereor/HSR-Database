import type { EnemyCatalogEntry, EnemyVariantIdentity } from '../domain/types.js';
import { normalizeSearch, normalizeSearchIdQuery, normalizeSearchLabel } from './normalization.js';

export interface EnemySearchResult {
  entry: EnemyCatalogEntry;
  variant?: EnemyVariantIdentity;
  exactId: boolean;
}

export function matchEnemy(entry: EnemyCatalogEntry, query: string): EnemySearchResult | undefined {
  const id = normalizeSearchIdQuery(query);
  if (!id) return { entry, exactId: false };

  const exactVariant = entry.variants.find(({ monsterId }) => monsterId === id);
  if (exactVariant) return { entry, variant: exactVariant, exactId: true };
  if (entry.id === id) return { entry, exactId: true };

  const needle = normalizeSearch(query);
  if (!needle) return undefined;
  if (normalizeSearchLabel(entry.name).includes(needle)) return { entry, exactId: false };

  let score = 0;
  let variant: EnemyVariantIdentity | undefined;
  for (const candidate of entry.variants) {
    const name = normalizeSearchLabel(candidate.name);
    const rank = name === needle ? 3 : name.startsWith(needle) ? 2 : name.includes(needle) ? 1 : 0;
    if (!rank || rank < score) continue;
    variant = rank > score ? candidate : undefined;
    score = rank;
  }
  return score ? { entry, variant, exactId: false } : undefined;
}
