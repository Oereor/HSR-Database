import type { CatalogEntry, EnemyCatalogEntry } from './types.js';

export const ENEMY_RANK_CATEGORIES = [
  { code: 'normal', label: '普通敌人' },
  { code: 'elite', label: '精英敌人' },
  { code: 'boss', label: '首领敌人' }
] as const;

export type EnemyRankCategory = (typeof ENEMY_RANK_CATEGORIES)[number]['code'];

const rankCategories: Readonly<Record<string, EnemyRankCategory>> = {
  Minion: 'normal',
  MinionLv2: 'normal',
  Elite: 'elite',
  LittleBoss: 'boss',
  BigBoss: 'boss'
};

export function getEnemyRankCategory(rank: string | undefined): EnemyRankCategory | undefined {
  return rank ? rankCategories[rank] : undefined;
}

export function getEnemyRankLabel(rank: string | undefined): string {
  const category = getEnemyRankCategory(rank);
  return ENEMY_RANK_CATEGORIES.find((option) => option.code === category)?.label ?? '敌方单位';
}

export function normalizeEnemyRankFilter(value: string): string {
  return getEnemyRankCategory(value) ?? value;
}

export function isEnemyCatalogEntry(entry: CatalogEntry): entry is EnemyCatalogEntry {
  return Array.isArray((entry as Partial<EnemyCatalogEntry>).weaknesses);
}
