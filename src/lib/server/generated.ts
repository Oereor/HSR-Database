import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CatalogEntry,
  DataManifest,
  EnemyCatalogEntry,
  HomepageRecentWarpData,
  RelicCatalogEntry,
  RelicProperty
} from '$lib/domain/types';
import type { GlobalSearchIndex, SearchLocale } from '$lib/domain/search-index';
import type { CategorySlug } from '$lib/domain/constants';

const root = path.resolve('src', 'lib', 'generated');
const staticGeneratedRoot = path.resolve('static', 'generated');
const searchIndexCache = new Map<string, Promise<GlobalSearchIndex>>();

async function readJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(root, 'views', 'zh-CN', ...segments), 'utf8')) as T;
}

async function readRootJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(root, ...segments), 'utf8')) as T;
}

export const getManifest = () => readRootJson<DataManifest>('manifest.json');
export const getHomepageRecentWarps = () => readJson<HomepageRecentWarpData>('homepage.json');
export const getCatalog = (category: CategorySlug) =>
  readJson<CatalogEntry[]>('catalogs', `${category}.json`);
export const getEnemyCatalog = () => readJson<EnemyCatalogEntry[]>('catalogs', 'enemies.json');
export const getRelicCatalog = () => readJson<RelicCatalogEntry[]>('catalogs', 'relics.json');
export const getRelicProperties = () =>
  readJson<RelicProperty[]>('catalogs', 'relic-properties.json');
export const getDetail = (category: CategorySlug, id: string) =>
  readJson<Record<string, unknown>>('details', category, `${id}.json`);
export const getSearchIndex = (locale: SearchLocale = 'zh-CN') => {
  let cached = searchIndexCache.get(locale);
  if (!cached) {
    cached = readFile(path.join(staticGeneratedRoot, locale, 'search.json'), 'utf8').then(
      (contents) => JSON.parse(contents) as GlobalSearchIndex
    );
    searchIndexCache.set(locale, cached);
  }
  return cached;
};
