export const CHANGELOG_DISMISSED_DATE_KEY = 'hsrarchive:changelog-dismissed-date';

export interface DateLike {
  getFullYear(): number;
  getMonth(): number;
  getDate(): number;
}

export function localDateKey(date: DateLike = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shouldAutoOpenChangelog(
  entriesCount: number,
  dismissedDate: string | null | undefined,
  today = localDateKey()
): boolean {
  return entriesCount > 0 && dismissedDate !== today;
}

export function dismissChangelogForToday(
  storage: Pick<Storage, 'setItem'> | undefined,
  today = localDateKey()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CHANGELOG_DISMISSED_DATE_KEY, today);
    return true;
  } catch {
    return false;
  }
}
