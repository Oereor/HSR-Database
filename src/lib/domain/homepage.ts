/** Locale-independent ordering, with no entity-specific selection policy. */
export function selectHomepageArtwork<T extends { id: string; rarity?: number }>(
  entries: T[],
  resolve: (id: string) => string | undefined,
  limit: number
): string[] {
  return [...entries]
    .sort(
      (a, b) =>
        (b.rarity ?? 0) - (a.rarity ?? 0) ||
        a.id.length - b.id.length ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    .flatMap((entry) => {
      const url = resolve(entry.id);
      return url ? [url] : [];
    })
    .slice(0, limit);
}
