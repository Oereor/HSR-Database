import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, devices } from '@playwright/test';
import { build } from 'vite';
import { siteRoot } from '../data/paths.js';
import type { GlobalSearchIndex } from '../../src/lib/domain/search-index.js';
import type { GlobalSearchCatalogs } from '../../src/lib/search/search.js';

// Run against a production preview, with no other browser tests competing for CPU.
const origin = process.env.SEARCH_BENCHMARK_URL ?? 'http://127.0.0.1:4173';
const queries = ['三月七', '丹恒', '丹恒饮月', '银鬃尉官', '的', '者'];
const bundleBytes = await readFile(path.join(siteRoot, 'static/generated/search.json'));
const index = JSON.parse(bundleBytes.toString()) as GlobalSearchIndex;
const catalogs = Object.fromEntries(
  await Promise.all(
    ['characters', 'light-cones', 'relics', 'enemies'].map(async (file) => [
      file === 'light-cones' ? 'lightCones' : file,
      JSON.parse(
        await readFile(path.join(siteRoot, `src/lib/generated/catalogs/${file}.json`), 'utf8')
      )
    ])
  )
) as unknown as GlobalSearchCatalogs;
console.log('Preparing browser measurement module');
const output = await build({
  configFile: false,
  logLevel: 'silent',
  publicDir: false,
  build: {
    write: false,
    minify: true,
    lib: { entry: path.join(siteRoot, 'src/lib/search/search.ts'), formats: ['es'] }
  }
});
if (!Array.isArray(output) || output[0].output[0].type !== 'chunk')
  throw new Error('Expected a single browser benchmark module');
const moduleSource = output[0].output[0].code;
console.log('Launching Chromium');
const browser = await chromium.launch();
const runs: unknown[] = [];
try {
  for (const [project, device] of [
    ['desktop-chromium', devices['Desktop Chrome']],
    ['mobile-chromium', devices['Pixel 5']]
  ] as const) {
    for (let run = 1; run <= 3; run += 1) {
      const context = await browser.newContext(device);
      await context.addInitScript(() => {
        const now = new Date();
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        localStorage.setItem('hsrarchive:changelog-dismissed-date', day);
      });
      const page = await context.newPage();
      await page.route('**/__search-benchmark.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: moduleSource })
      );
      await page.goto(`${origin}/search`);
      const engine = await page.evaluate(
        async ({ index, catalogs, queries }) => {
          const url = '/__search-benchmark.js';
          const { createGlobalSearchService } = (await import(
            url
          )) as typeof import('../../src/lib/search/search.js');
          const start = performance.now();
          const service = createGlobalSearchService(index, catalogs);
          const buildMs = performance.now() - start;
          const searches = queries.map((query) => {
            const durations: number[] = [];
            for (let sample = 0; sample < 100; sample += 1) {
              const started = performance.now();
              for (let repeat = 0; repeat < 10; repeat += 1) service.search(query);
              durations.push((performance.now() - started) / 10);
            }
            const result = service.search(query);
            return {
              query,
              queryMedianMs: durations.sort((a, b) => a - b)[50],
              ordinaryCount: Object.entries(result.results)
                .filter(([key]) => key !== 'endgame')
                .reduce((total, [, entries]) => total + (entries as unknown[]).length, 0),
              endgameCount: result.endgameMatches.reduce(
                (total, entry) => total + entry.locators.length,
                0
              ),
              buckets: result.endgameMatches.length
            };
          });
          return { buildMs, searches };
        },
        { index, catalogs, queries }
      );
      const jsResources = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter(
            (item) => item.name.includes('/_app/') && new URL(item.name).pathname.endsWith('.js')
          )
          .map((item) => ({
            url: new URL(item.name).pathname,
            bytes: (item as PerformanceResourceTiming).decodedBodySize
          }))
      );
      for (const search of engine.searches) {
        await page.goto(`${origin}/search`);
        const input = page.getByPlaceholder('搜索角色、光锥、遗器、敌方单位…');
        await input.fill(search.query);
        await page.evaluate(() => {
          const state = window as typeof window & { searchTasks: number[] };
          state.searchTasks = [];
          new PerformanceObserver((list) => {
            state.searchTasks.push(...list.getEntries().map((entry) => entry.duration));
          }).observe({ type: 'longtask' });
        });
        const start = performance.now();
        await input.press('Enter');
        // The presentation may use windows; its totals still describe every result.
        await page.waitForFunction(
          ({ ordinaryCount, endgameCount }) => {
            const counters = [...document.querySelectorAll('[data-search-total]')];
            if (counters.length)
              return (
                counters.reduce(
                  (sum, node) => sum + Number(node.getAttribute('data-search-total')),
                  0
                ) ===
                ordinaryCount + endgameCount
              );
            return (
              document.querySelectorAll('.entity-overview-card').length === ordinaryCount &&
              document.querySelectorAll('[data-endgame-enemy-card]').length === endgameCount
            );
          },
          search,
          { timeout: 60_000 }
        );
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );
        const rendering = await page.evaluate(() => {
          const tasks = (window as typeof window & { searchTasks: number[] }).searchTasks;
          return {
            longestTaskMs: Math.max(0, ...tasks),
            blockingMs: tasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0),
            renderedCards: document.querySelectorAll(
              '.entity-overview-card, [data-endgame-enemy-card]'
            ).length
          };
        });
        const row = {
          project,
          run,
          ...search,
          ...rendering,
          elapsedMs: performance.now() - start,
          buildMs: engine.buildMs
        };
        runs.push(row);
        console.log(JSON.stringify(row));
      }
      if (run === 1)
        runs.push({
          project,
          browserJavaScriptBytes: jsResources.reduce((sum, item) => sum + item.bytes, 0),
          jsResources
        });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const report = {
  documents: index.documents.length,
  searchBundleBytes: bundleBytes.length,
  searchBundleGzipBytes: gzipSync(bundleBytes).length,
  browser: browser.version(),
  sourceCommit: index.sourceCommit,
  runs
};
await writeFile(
  path.join(siteRoot, 'data/audit/search-v2-performance.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
