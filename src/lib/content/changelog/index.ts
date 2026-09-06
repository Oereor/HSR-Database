import type { Component } from 'svelte';
import type { Locale } from '$lib/paraglide/runtime.js';
import { CHANGELOG_ENTRY_METADATA } from './entries.js';

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
const modules = import.meta.glob<ChangelogModule>('./{zh-CN,en}/*.svx');

function sourcePath(locale: Locale, id: string): string {
  return `./${locale}/${id}.svx`;
}

function fail(source: string, message: string): never {
  throw new Error(`[changelog] ${source}: ${message}`);
}

export function validateChangelogSources(sources: readonly string[] = Object.keys(modules)): void {
  const expected = new Set(
    CHANGELOG_ENTRY_METADATA.flatMap(({ id }) => [sourcePath('zh-CN', id), sourcePath('en', id)])
  );
  const actual = new Set(sources);
  const missing = [...expected].filter((source) => !actual.has(source));
  const orphaned = [...actual].filter((source) => !expected.has(source));
  if (missing.length || orphaned.length)
    fail(
      'locale parity',
      `missing: ${missing.join(', ') || 'none'}; orphaned: ${orphaned.join(', ') || 'none'}`
    );
}

function validateModule(source: string, module: ChangelogModule): ChangelogModule {
  if (!module || typeof module !== 'object' || typeof module.default !== 'function')
    fail(source, 'missing renderable Markdown component');
  if (!module.metadata || typeof module.metadata !== 'object' || Array.isArray(module.metadata))
    fail(source, 'missing frontmatter metadata');
  const title = (module.metadata as Record<string, unknown>).title;
  if (typeof title !== 'string' || !title.trim()) fail(source, 'title must be a non-empty string');
  return module;
}

function validateDate(value: unknown, source: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return fail(source, 'date must use YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return fail(source, 'date is invalid');
  return value;
}

/** Compatibility helper retained for focused loader tests. */
export function collectChangelogEntries(
  sourceModules: Record<string, ChangelogModule>
): ChangelogEntry[] {
  return Object.entries(sourceModules)
    .map(([source, candidate]) => {
      const module = validateModule(source, candidate);
      const metadata = module.metadata as Record<string, unknown>;
      return {
        id: source.replace(/^\.\//, '').replace(/\.svx$/, ''),
        date: validateDate(metadata.date, source),
        title: String(metadata.title).trim(),
        component: module.default
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export async function loadChangelogEntries(locale: Locale): Promise<ChangelogEntry[]> {
  validateChangelogSources();
  return Promise.all(
    [...CHANGELOG_ENTRY_METADATA]
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
      .map(async ({ id, date }) => {
        const source = sourcePath(locale, id);
        const loader = modules[source] as ChangelogLoader | undefined;
        if (!loader) return fail(source, 'localized content is missing');
        const module = validateModule(source, await loader());
        return {
          id,
          date,
          title: String((module.metadata as Record<string, unknown>).title).trim(),
          component: module.default
        };
      })
  );
}

export function formatChangelogDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
}
