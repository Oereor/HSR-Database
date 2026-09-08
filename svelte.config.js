import adapter from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync(new URL('./src/lib/generated/manifest.json', import.meta.url), 'utf8')
);
const localizedRoute = (route, locale) =>
  locale === manifest.publicLocale ? route : `/${locale}${route === '/' ? '' : route}`;
const publicEntries = manifest.publicLocales.flatMap((locale) =>
  manifest.routePaths.map((route) => localizedRoute(route, locale))
);
const deploymentVersion = process.env.HSR_BUILD_VERSION?.trim();

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte', '.svx'],
  preprocess: [mdsvex({ extensions: ['.svx'] })],
  kit: {
    adapter: adapter({ fallback: '404.html' }),
    prerender: { entries: ['*', ...publicEntries] },
    ...(deploymentVersion ? { version: { name: deploymentVersion } } : {})
  }
};

export default config;
