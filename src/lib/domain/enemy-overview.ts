import type { CatalogEntry, EnemyCatalogEntry } from './types.js';
import { m } from '$lib/paraglide/messages.js';

export const ENEMY_RANK_CATEGORIES = [
  { code: 'normal' },
  { code: 'elite' },
  { code: 'boss' }
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
  switch (category) {
    case 'normal':
      return m.enemy_rank_normal();
    case 'elite':
      return m.enemy_rank_elite();
    case 'boss':
      return m.enemy_rank_boss();
    default:
      return m.enemy_rank_unknown();
  }
}

export function normalizeEnemyRankFilter(value: string): string {
  return getEnemyRankCategory(value) ?? value;
}

export function isEnemyCatalogEntry(entry: CatalogEntry): entry is EnemyCatalogEntry {
  const enemy = entry as Partial<EnemyCatalogEntry>;
  return (
    !!enemy.camp && Array.isArray(enemy.representative?.weaknesses) && Array.isArray(enemy.variants)
  );
}

export function getEnemyCampOptions(entries: readonly EnemyCatalogEntry[]) {
  const camps = new Map(entries.map(({ camp }) => [camp.id, camp]));
  return [...camps.values()]
    .sort(
      (left, right) =>
        left.sortId - right.sortId ||
        left.id.length - right.id.length ||
        left.id.localeCompare(right.id, 'en')
    )
    .map(({ id, name }) => ({ value: id, label: name }));
}

export type EnemyOverviewFilterState = {
  camps: Set<string>;
  types: Set<string>;
  weaknesses: Set<string>;
};

export const readEnemyOverviewFilterState = (
  params: URLSearchParams
): EnemyOverviewFilterState => ({
  camps: new Set(params.getAll('camp').filter(Boolean)),
  types: new Set(params.getAll('type').filter(Boolean).map(normalizeEnemyRankFilter)),
  weaknesses: new Set(params.getAll('weakness').filter(Boolean))
});

export function writeEnemyOverviewFilterState(
  params: URLSearchParams,
  state: EnemyOverviewFilterState
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['type', 'weakness', 'camp']) next.delete(key);
  for (const value of state.types) next.append('type', value);
  for (const value of state.weaknesses) next.append('weakness', value);
  for (const value of state.camps) next.append('camp', value);
  next.delete('page');
  return next;
}

export const hasEnemyOverviewFilters = (state: EnemyOverviewFilterState): boolean =>
  state.types.size > 0 || state.weaknesses.size > 0 || state.camps.size > 0;

export function getWeaknessMatchCount(
  entry: EnemyCatalogEntry,
  selectedWeaknesses: ReadonlySet<string>
): number {
  if (selectedWeaknesses.size === 0) return 0;
  return new Set(
    entry.representative.weaknesses
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
  const campMatch = state.camps.size === 0 || state.camps.has(entry.camp.id);
  return typeMatch && weaknessMatch && campMatch;
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
