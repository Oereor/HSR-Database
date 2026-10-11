import { getCatalog, getDetail, getCharacterSearch } from './generated';
import type { SearchDocumentBundle } from '$lib/search/documents';
import type { CatalogEntry } from '$lib/domain/types';
import type { SearchLocale } from '$lib/domain/search-index';
import type { PlannerCharacterOption } from '$lib/action-planner/types';

interface PlannerSource {
  search?(locale: SearchLocale): Promise<SearchDocumentBundle>;
  catalog(
    locale: SearchLocale,
    category: 'characters' | 'relics' | 'light-cones'
  ): Promise<CatalogEntry[]>;
  detail(
    locale: SearchLocale,
    category: 'characters',
    id: string
  ): Promise<Record<string, unknown>>;
}

/** Server-only projection: no raw detail or full equipment catalog enters page data. */
export async function loadPlannerData(
  locale: SearchLocale,
  source: PlannerSource = { catalog: getCatalog, detail: getDetail, search: getCharacterSearch }
) {
  const [catalog, relics, lightCones, search] = await Promise.all([
    source.catalog(locale, 'characters'),
    source.catalog(locale, 'relics'),
    source.catalog(locale, 'light-cones'),
    source.search?.(locale)
  ]);
  const names = new Map(
    search?.documents
      .filter((doc) => doc.target.kind === 'character')
      .map((doc) => [doc.target.id, doc])
  );
  const characters: PlannerCharacterOption[] = await Promise.all(
    catalog.map(async (entry) => {
      let baseSpeed: number | undefined;
      try {
        const detail = await source.detail(locale, 'characters', entry.id);
        const stats = detail.baseStats as { fixed?: { speed?: unknown } } | undefined;
        const value = stats?.fixed?.speed;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) baseSpeed = value;
      } catch {
        /* A locally unavailable detail remains selectable with manual speed input. */
      }
      return {
        id: entry.id,
        name: entry.name,
        avatarId: entry.id,
        officialAliases: names.get(entry.id)?.officialAliases ?? [],
        playerAliases: names.get(entry.id)?.playerAliases ?? [],
        ...(baseSpeed === undefined ? {} : { baseSpeed })
      };
    })
  );
  return {
    characters,
    presets: {
      vonwacq: relics.find((entry) => entry.id === '308')?.name,
      eagle: relics.find((entry) => entry.id === '110')?.name,
      dance: lightCones.find((entry) => entry.id === '21018')?.name
    }
  };
}
