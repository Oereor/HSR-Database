import type { SearchEntry } from '$lib/domain/types';
import { gameTextToPlain } from '$lib/domain/game-text';

export const normalizeSearch = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s·•・—_\-/]+/g, '');

export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  return entries
    .map((entry) => {
      const labels = [entry.name, ...entry.aliases].map(gameTextToPlain).map(normalizeSearch);
      const score = Math.max(
        ...labels.map((label) => {
          if (label === needle) return 100;
          if (label.startsWith(needle)) return 80 - label.length / 100;
          if (label.includes(needle)) return 50 - label.indexOf(needle) / 100;
          return 0;
        })
      );
      return { entry, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'zh-CN'))
    .slice(0, 80)
    .map((result) => result.entry);
}
