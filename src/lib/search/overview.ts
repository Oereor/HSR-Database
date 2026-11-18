import { gameTextToPlain } from '../domain/game-text.js';
import type { CatalogEntry } from '../domain/types.js';
import type { TrailblazerGender } from '../domain/trailblazer.js';
import { alternateTrailblazerSearchName, staticCharacterSearchEntry } from './character-search.js';
import { normalizeSearchIdQuery } from './normalization.js';

export function overviewSearch(query: string) {
  const id = normalizeSearchIdQuery(query);
  const text = id.toLocaleLowerCase();
  const matchesLabel = (label: string) => gameTextToPlain(label).toLocaleLowerCase().includes(text);
  return {
    matchesLabel,
    matches(entry: CatalogEntry): boolean {
      return !text || entry.id === id || matchesLabel(`${entry.name} ${entry.description ?? ''}`);
    },
    compareId(a: CatalogEntry, b: CatalogEntry): number {
      if (!id || a.id === b.id) return 0;
      if (a.id === id) return -1;
      return b.id === id ? 1 : 0;
    }
  };
}

export function characterOverviewSearch(query: string, gender: TrailblazerGender) {
  const search = overviewSearch(query);
  const id = normalizeSearchIdQuery(query);
  return {
    compareId: search.compareId,
    match(entry: CatalogEntry): CatalogEntry[] {
      return staticCharacterSearchEntry(entry, gender, id).filter((display) => {
        const alternate = alternateTrailblazerSearchName(entry);
        return (
          search.matches(entry) ||
          search.matches(display) ||
          (alternate !== undefined && search.matchesLabel(alternate)) ||
          entry.searchAliases?.some(search.matchesLabel)
        );
      });
    }
  };
}
