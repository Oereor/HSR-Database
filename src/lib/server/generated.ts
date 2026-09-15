import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CatalogEntry,
  DataManifest,
  Enemy,
  EnemyCatalogEntry,
  HomepageRecentWarpData,
  PublicSiteVersion,
  RelicCatalogEntry,
  RelicProperty
} from '$lib/domain/types';
import type { GlobalSearchIndex, SearchLocale } from '$lib/domain/search-index';
import type { CategorySlug } from '$lib/domain/constants';
import type { EndgameDatasetByMode, EndgameMode, EndgameModeDataset } from '$lib/domain/endgame';

const root = path.resolve('src', 'lib', 'generated');
const staticGeneratedRoot = path.resolve('static', 'generated');
const searchIndexCache = new Map<string, Promise<GlobalSearchIndex>>();
const endgameDatasetCache = new Map<string, Promise<EndgameModeDataset>>();
const enemyDetailCache = new Map<string, Promise<Enemy>>();
let manifestCache: Promise<DataManifest> | undefined;

async function readJson<T>(locale: SearchLocale, ...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(root, 'views', locale, ...segments), 'utf8')) as T;
}

async function readRootJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(root, ...segments), 'utf8')) as T;
}

export const getManifest = () => (manifestCache ??= readRootJson<DataManifest>('manifest.json'));
export const getPublicSiteVersion = async (): Promise<PublicSiteVersion> => {
  const manifest = await getManifest();
  return { gameVersion: manifest.gameVersion, dataRevision: manifest.dataRevision.slice(0, 8) };
};
export const getHomepageRecentWarps = (locale: SearchLocale) =>
  readJson<HomepageRecentWarpData>(locale, 'homepage.json');
export const getCatalog = (locale: SearchLocale, category: CategorySlug) =>
  readJson<CatalogEntry[]>(locale, 'catalogs', `${category}.json`);
export const getEnemyCatalog = (locale: SearchLocale) =>
  readJson<EnemyCatalogEntry[]>(locale, 'catalogs', 'enemies.json');
export const getRelicCatalog = (locale: SearchLocale) =>
  readJson<RelicCatalogEntry[]>(locale, 'catalogs', 'relics.json');
export const getRelicProperties = (locale: SearchLocale) =>
  readJson<RelicProperty[]>(locale, 'catalogs', 'relic-properties.json');
export const getDetail = (locale: SearchLocale, category: CategorySlug, id: string) =>
  readJson<Record<string, unknown>>(locale, 'details', category, `${id}.json`);
export function getEnemyDetail(locale: SearchLocale, id: string): Promise<Enemy> {
  const key = `${locale}:${id}`;
  let cached = enemyDetailCache.get(key);
  if (!cached) {
    cached = readJson<Enemy>(locale, 'details', 'enemies', `${id}.json`).then((detail) => {
      if (detail.kind !== 'enemy' || detail.id !== id)
        throw new Error(`Enemy detail identity mismatch: ${key}`);
      return detail;
    });
    enemyDetailCache.set(key, cached);
  }
  return cached;
}
export function getGeneratedEndgameDataset<TMode extends EndgameMode>(
  mode: TMode,
  locale: SearchLocale
): Promise<EndgameDatasetByMode[TMode]> {
  const key = `${locale}:${mode}`;
  const cached = endgameDatasetCache.get(key);
  if (cached) return cached as Promise<EndgameDatasetByMode[TMode]>;
  const pending = readJson<EndgameModeDataset>(locale, 'endgame', `${mode}.json`).then(
    (dataset) => {
      if (dataset.schemaVersion !== 24 || dataset.mode !== mode)
        throw new Error(`${mode} Endgame data schema or mode mismatch`);
      return dataset;
    }
  );
  endgameDatasetCache.set(key, pending);
  return pending as Promise<EndgameDatasetByMode[TMode]>;
}
export const getSearchIndex = (locale: SearchLocale) => {
  let cached = searchIndexCache.get(locale);
  if (!cached) {
    cached = readFile(path.join(staticGeneratedRoot, locale, 'search.json'), 'utf8').then(
      (contents) => JSON.parse(contents) as GlobalSearchIndex
    );
    searchIndexCache.set(locale, cached);
  }
  return cached;
};
