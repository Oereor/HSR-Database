export const CHANGELOG_LOCALES = ['zh-CN', 'en'] as const;

export type ChangelogLocale = (typeof CHANGELOG_LOCALES)[number];

export interface ChangelogMetadata {
  title: string;
}

export interface DiscoveredChangelogSource<TModule> {
  source: string;
  load: () => Promise<TModule>;
}

export interface ChangelogManifestEntry<TModule> {
  id: string;
  date: string;
  locales: Record<ChangelogLocale, DiscoveredChangelogSource<TModule>>;
}

const sourcePattern = /^\.\/(zh-CN|en)\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.svx$/;

function fail(source: string, message: string): never {
  throw new Error(`[changelog] ${source}: ${message}`);
}

function validateDate(value: string, source: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return fail(source, `entry id contains invalid date ${value}`);
  return value;
}

export function validateChangelogMetadata(metadata: unknown, source: string): ChangelogMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return fail(source, 'missing frontmatter metadata');
  const title = (metadata as Record<string, unknown>).title;
  if (typeof title !== 'string' || !title.trim())
    return fail(source, 'title must be a non-empty string');
  return { title: title.trim() };
}

export function discoverChangelogSources<TModule>(
  moduleLoaders: Readonly<Record<string, () => Promise<TModule>>>
): DiscoveredChangelogSource<TModule>[] {
  return Object.entries(moduleLoaders)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, load]) => ({ source, load }));
}

export function buildChangelogManifest<TModule>(
  sources: readonly DiscoveredChangelogSource<TModule>[]
): ChangelogManifestEntry<TModule>[] {
  const entries = new Map<
    string,
    {
      date: string;
      locales: Partial<Record<ChangelogLocale, DiscoveredChangelogSource<TModule>>>;
    }
  >();

  for (const discoveredSource of sources) {
    const { source } = discoveredSource;
    const match = source.match(sourcePattern);
    if (!match) fail(source, 'path must match ./<zh-CN|en>/YYYY-MM-DD-lowercase-kebab-slug.svx');
    const [, localeValue, id] = match;
    const locale = localeValue as ChangelogLocale;
    const date = validateDate(id.slice(0, 10), source);
    const entry = entries.get(id) ?? { date, locales: {} };
    if (entry.locales[locale]) fail(source, `duplicate ${locale} source for entry ${id}`);
    entry.locales[locale] = discoveredSource;
    entries.set(id, entry);
  }

  return [...entries.entries()]
    .map(([id, entry]) => {
      const missing = CHANGELOG_LOCALES.filter((locale) => !entry.locales[locale]);
      if (missing.length) fail(id, `missing locale counterpart: ${missing.join(', ')}`);
      return {
        id,
        date: entry.date,
        locales: entry.locales as Record<ChangelogLocale, DiscoveredChangelogSource<TModule>>
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
