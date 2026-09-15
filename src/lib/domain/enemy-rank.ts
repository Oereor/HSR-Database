export const ENEMY_RANK_CATEGORIES = [
  { code: 'normal' },
  { code: 'elite' },
  { code: 'boss' }
] as const;

export type EnemyRankCategory = (typeof ENEMY_RANK_CATEGORIES)[number]['code'];

export const ENEMY_RANKS = ['Minion', 'MinionLv2', 'Elite', 'LittleBoss', 'BigBoss'] as const;

export type EnemyRank = (typeof ENEMY_RANKS)[number];

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
