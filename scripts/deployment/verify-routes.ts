import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { siteRoot } from './prepare.js';
import type { DataManifest } from '../../src/lib/domain/types.js';

/** Verifies public page outputs and their rendered internal links independently of hydration. */
export async function verifyBuildPageRoutes(
  pagePaths: string[],
  buildRoot = path.join(siteRoot, 'build')
): Promise<void> {
  const failures: string[] = [];
  const pageIdentities = new Set(pagePaths.map((href) => href.replace(/\/$/, '') || '/'));
  for (const href of pagePaths) {
    const directory = href.replace(/^\//, '').replace(/\/$/, '');
    const htmlFile = path.join(buildRoot, directory, 'index.html');
    let html: string;
    try {
      html = await readFile(htmlFile, 'utf8');
    } catch {
      failures.push(`${href}: missing directory index.html`);
      continue;
    }
    if (directory) {
      const siblings = await readdir(path.dirname(path.join(buildRoot, directory)));
      if (siblings.includes(`${path.basename(directory)}.html`))
        failures.push(`${href}: stale extensionless-route .html output`);
    }
    for (const match of html.matchAll(/\b(?:href|action)="(\/[^"<>]*)"/g)) {
      const target = match[1].split(/[?#]/, 1)[0];
      if (target.startsWith('//')) continue;
      const identity = target.replace(/\/$/, '') || '/';
      if (pageIdentities.has(identity) && target !== '/' && !target.endsWith('/'))
        failures.push(`${href}: noncanonical page link ${match[1]}`);
      if (target.includes('//')) failures.push(`${href}: duplicate slash in ${match[1]}`);
    }
  }
  await readFile(path.join(buildRoot, '404.html'), 'utf8');
  if (failures.length) throw new Error(`Static route verification failed:\n${failures.join('\n')}`);
  console.log(
    `Static route verification passed: ${pagePaths.length} public page indexes and internal links.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { localizedHref } = await import('../../src/lib/i18n/routing.js');
  const manifest = JSON.parse(
    await readFile(path.join(siteRoot, 'src/lib/generated/manifest.json'), 'utf8')
  ) as DataManifest;
  await verifyBuildPageRoutes(
    manifest.publicLocales.flatMap((locale) =>
      manifest.routePaths.map((route) => localizedHref(route, locale))
    )
  );
}
