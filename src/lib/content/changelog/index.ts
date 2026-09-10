import type { Component } from 'svelte';
import type { Locale } from '$lib/paraglide/runtime.js';
import {
  buildChangelogManifest,
  discoverChangelogSources,
  validateChangelogMetadata,
  type ChangelogLocale
} from './manifest.js';

export interface ChangelogModule {
  default: Component;
  metadata?: unknown;
}

export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  component: Component;
}

type ChangelogLoader = () => Promise<ChangelogModule>;
const moduleLoaders = import.meta.glob<ChangelogModule>('./{zh-CN,en}/*.svx');

function fail(source: string, message: string): never {
  throw new Error(`[changelog] ${source}: ${message}`);
}

function validateModule(source: string, module: ChangelogModule): ChangelogModule {
  if (!module || typeof module !== 'object' || typeof module.default !== 'function')
    fail(source, 'missing renderable Markdown component');
  return module;
}

const discoveredSources = discoverChangelogSources(
  moduleLoaders as Record<string, ChangelogLoader>
);

export const changelogManifest = buildChangelogManifest(discoveredSources);

const entryCache = new Map<ChangelogLocale, Promise<ChangelogEntry[]>>();

export async function loadChangelogEntries(locale: Locale): Promise<ChangelogEntry[]> {
  const changelogLocale = locale as ChangelogLocale;
  let entries = entryCache.get(changelogLocale);
  if (!entries) {
    entries = Promise.all(
      changelogManifest.map(async ({ id, date, locales }) => {
        const localizedSource = locales[changelogLocale];
        if (!localizedSource) return fail(id, `unsupported locale ${locale}`);
        const module = validateModule(localizedSource.source, await localizedSource.load());
        const metadata = validateChangelogMetadata(module.metadata, localizedSource.source);
        return {
          id,
          date,
          title: metadata.title,
          component: module.default
        };
      })
    );
    entryCache.set(changelogLocale, entries);
  }
  return entries;
}

export function formatChangelogDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
}
