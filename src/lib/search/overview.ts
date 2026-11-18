import { gameTextToPlain } from '../domain/game-text.js';
import type { CatalogEntry } from '../domain/types.js';
import { normalizeSearchIdQuery } from './normalization.js';

export function overviewSearch(query: string) {
  const id = normalizeSearchIdQuery(query);
  const text = id.toLocaleLowerCase();
  return {
    matches(entry: CatalogEntry): boolean {
      return (
        !text ||
        entry.id === id ||
        gameTextToPlain(`${entry.name} ${entry.description ?? ''}`)
          .toLocaleLowerCase()
          .includes(text)
      );
    },
    compareId(a: CatalogEntry, b: CatalogEntry): number {
      if (!id || a.id === b.id) return 0;
      if (a.id === id) return -1;
      return b.id === id ? 1 : 0;
    }
  };
}
