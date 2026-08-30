import type { CatalogEntry, EnemyCatalogEntry } from './types.js';

export const ENEMY_RANK_CATEGORIES = [
  { code: 'normal', label: '普通敌人', filterLabel: '普通' },
  { code: 'elite', label: '精英敌人', filterLabel: '精英' },
  { code: 'boss', label: '首领敌人', filterLabel: '首领' }
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

export type EnemyOverviewFilterState = {
  types: Set<string>;
  weaknesses: Set<string>;
};

export const readEnemyOverviewFilterState = (
  params: URLSearchParams
): EnemyOverviewFilterState => ({
  types: new Set(params.getAll('type').filter(Boolean).map(normalizeEnemyRankFilter)),
  weaknesses: new Set(params.getAll('weakness').filter(Boolean))
});

export function writeEnemyOverviewFilterState(
  params: URLSearchParams,
  state: EnemyOverviewFilterState
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['type', 'weakness']) next.delete(key);
  for (const value of state.types) next.append('type', value);
  for (const value of state.weaknesses) next.append('weakness', value);
  next.delete('page');
  return next;
}

export const hasEnemyOverviewFilters = (state: EnemyOverviewFilterState): boolean =>
  state.types.size > 0 || state.weaknesses.size > 0;

export function getWeaknessMatchCount(
  entry: EnemyCatalogEntry,
  selectedWeaknesses: ReadonlySet<string>
): number {
  if (selectedWeaknesses.size === 0) return 0;
  return new Set(
    entry.weaknesses
      .map((weakness) => weakness.element)
      .filter((element) => selectedWeaknesses.has(element))
  ).size;
}

export function matchesEnemyOverviewFilters(
  entry: EnemyCatalogEntry,
  state: EnemyOverviewFilterState
): boolean {
  const category = getEnemyRankCategory(entry.type);
  const typeMatch = state.types.size === 0 || (category !== undefined && state.types.has(category));
  const weaknessMatch =
    state.weaknesses.size === 0 || getWeaknessMatchCount(entry, state.weaknesses) > 0;
  return typeMatch && weaknessMatch;
}

function compareNormalSort(a: EnemyCatalogEntry, b: EnemyCatalogEntry, sort: string): number {
  if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
  if (sort === 'id') return Number(a.id) - Number(b.id);
  return (b.rarity ?? 0) - (a.rarity ?? 0) || a.name.localeCompare(b.name, 'zh-CN');
}

export function compareEnemyOverviewEntries(
  a: EnemyCatalogEntry,
  b: EnemyCatalogEntry,
  sort: string,
  selectedWeaknesses: ReadonlySet<string>
): number {
  if (selectedWeaknesses.size === 0) return compareNormalSort(a, b, sort);
  return (
    getWeaknessMatchCount(b, selectedWeaknesses) - getWeaknessMatchCount(a, selectedWeaknesses) ||
    compareNormalSort(a, b, sort) ||
    Number(a.id) - Number(b.id)
  );
}
