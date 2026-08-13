export const CATEGORY_CONFIG = {
  characters: { label: '角色', singular: '角色', kind: 'character', href: '/characters' },
  'light-cones': { label: '光锥', singular: '光锥', kind: 'light-cone', href: '/light-cones' },
  relics: { label: '遗器', singular: '遗器套装', kind: 'relic', href: '/relics' },
  enemies: { label: '敌人', singular: '敌人', kind: 'enemy', href: '/enemies' }
} as const;

export type CategorySlug = keyof typeof CATEGORY_CONFIG;

export const isCategory = (value: string): value is CategorySlug => value in CATEGORY_CONFIG;

export const rarityFromCode = (value?: string): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/(\d)$/);
  if (match) return Number(match[1]);
  return { Normal: 2, NotNormal: 2, Rare: 3, VeryRare: 4, SuperRare: 5 }[value];
};

export const relicTypeNames: Record<string, string> = {
  HEAD: '头部',
  HAND: '手部',
  BODY: '躯干',
  FOOT: '脚部',
  NECK: '位面球',
  OBJECT: '连结绳'
};
