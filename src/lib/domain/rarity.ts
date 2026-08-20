const RARITY_COLORS: Readonly<Partial<Record<number, string>>> = {
  5: '#ffd700',
  4: '#c77dff',
  3: '#6090ff'
};

export const getRarityColor = (rarity: number | undefined): string | undefined =>
  rarity === undefined ? undefined : RARITY_COLORS[rarity];
