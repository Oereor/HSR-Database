import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatalogEntry, DataManifest } from '$lib/domain/types';
import type { CategorySlug } from '$lib/domain/constants';

const root = path.resolve('src', 'lib', 'generated');

async function readJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(root, ...segments), 'utf8')) as T;
}

export const getManifest = () => readJson<DataManifest>('manifest.json');
export const getCatalog = (category: CategorySlug) =>
  readJson<CatalogEntry[]>('catalogs', `${category}.json`);
export const getDetail = (category: CategorySlug, id: string) =>
  readJson<Record<string, unknown>>('details', category, `${id}.json`);
