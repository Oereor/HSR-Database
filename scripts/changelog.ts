import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { compile } from 'mdsvex';
import {
  buildChangelogManifest,
  validateChangelogMetadata,
  type DiscoveredChangelogSource
} from '../src/lib/content/changelog/manifest.js';

const siteRoot = path.resolve(import.meta.dirname, '..');
const changelogRoot = path.join(siteRoot, 'src', 'lib', 'content', 'changelog');
const locales = ['zh-CN', 'en'] as const;

export async function validateChangelogFiles(root = changelogRoot): Promise<void> {
  const sources: DiscoveredChangelogSource<void>[] = [];
  for (const locale of locales) {
    const localeRoot = path.join(root, locale);
    const entries = await readdir(localeRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.svx')) continue;
      const filename = path.join(localeRoot, entry.name);
      const source = `./${locale}/${entry.name}`;
      const compiled = await compile(await readFile(filename, 'utf8'), {
        filename,
        extension: '.svx'
      });
      validateChangelogMetadata(compiled?.data?.fm, source);
      sources.push({ source, load: async () => undefined });
    }
  }
  buildChangelogManifest(sources);
}
