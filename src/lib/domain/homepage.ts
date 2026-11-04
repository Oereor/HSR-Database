/** Select the first five-star entity in the existing version-diff order. */
export function selectHomepageArtwork<T extends { id: string; rarity?: number }>(
  entries: readonly T[],
  resolve: (id: string) => string | undefined
): string | undefined {
  const entry = entries.find(({ rarity }) => rarity === 5);
  return entry ? resolve(entry.id) : undefined;
}
