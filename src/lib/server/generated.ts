import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CatalogEntry,
  DataManifest,
  EnemyCatalogEntry,
  HomepageRecentWarpData,
  PublicSiteVersion,
  RelicCatalogEntry,
  RelicProperty
} from '$lib/domain/types';
import type { GlobalSearchIndex, SearchLocale } from '$lib/domain/search-index';
import type { CategorySlug } from '$lib/domain/constants';

const root = path.resolve('src', 'lib', 'generated');
const staticGeneratedRoot = path.resolve('static', 'generated');
const searchIndexCache = new Map<string, Promise<GlobalSearchIndex>>();

async function readJson<T>(locale: SearchLocale, ...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(root, 'views', locale, ...segments), 'utf8')) as T;
}

async function readRootJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(root, ...segments), 'utf8')) as T;
}

export const getManifest = () => readRootJson<DataManifest>('manifest.json');
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
