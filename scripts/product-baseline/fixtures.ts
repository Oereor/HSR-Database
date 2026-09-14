import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteRoot } from '../data/paths.js';
import { canonicalJson } from './canonical.js';
import { PRODUCT_BASELINE_CASES } from './cases.js';
import type { ProductBaselineCapture } from './model.js';

export const productBaselineFixtureRoot = path.join(
  siteRoot,
  'tests',
  'fixtures',
  'product-baseline',
  'zh-CN'
);

export function expectedProductBaselineFixturePaths(): string[] {
  return [
    'metadata.json',
    ...PRODUCT_BASELINE_CASES.characters.map(({ id }) => `characters/${id}.json`),
    ...PRODUCT_BASELINE_CASES.lightCones.map(({ id }) => `light-cones/${id}.json`),
    ...PRODUCT_BASELINE_CASES.relics.map(({ id }) => `relics/${id}.json`),
    ...PRODUCT_BASELINE_CASES.enemies.map(({ id }) => `enemies/${id}.json`),
    ...PRODUCT_BASELINE_CASES.endgame.map(({ mode, groupId }) => `endgame/${mode}/${groupId}.json`),
    'endgame/boundaries.json',
    'homepage.json',
    'search.json'
  ].sort((left, right) => left.localeCompare(right, 'en'));
}

async function listJsonFiles(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true }).catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return listJsonFiles(root, child);
      return entry.isFile() && entry.name.endsWith('.json')
        ? [child.split(path.sep).join('/')]
        : [];
    })
  );
  return files.flat().sort((left, right) => left.localeCompare(right, 'en'));
}

export async function assertProductBaselineFixtureTree(
  root = productBaselineFixtureRoot
): Promise<void> {
  const expected = expectedProductBaselineFixturePaths();
  const actual = await listJsonFiles(root);
  const missing = expected.filter((file) => !actual.includes(file));
  const unexpected = actual.filter((file) => !expected.includes(file));
  if (missing.length || unexpected.length)
    throw new Error(
      `Product baseline fixture tree mismatch: missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}]`
    );
}

async function readJson<T>(root: string, relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8')) as T;
}

async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${canonicalJson(value, true)}\n`, 'utf8');
}

function assertWritableFixtureRoot(root: string): void {
  if (path.resolve(root) !== path.resolve(productBaselineFixtureRoot))
    throw new Error(
      'Refusing to replace a product baseline outside the authoritative fixture root'
    );
}

export async function writeProductBaselineFixtures(
  capture: ProductBaselineCapture,
  approvalReason: string
): Promise<void> {
  if (!approvalReason.trim()) throw new Error('Product baseline approval reason must not be empty');
  assertWritableFixtureRoot(productBaselineFixtureRoot);
  await rm(productBaselineFixtureRoot, { recursive: true, force: true });
  await mkdir(productBaselineFixtureRoot, { recursive: true });
  await writeJson(productBaselineFixtureRoot, 'metadata.json', {
    ...capture.metadata,
    approvalReason: approvalReason.trim()
  });
  for (const { id } of PRODUCT_BASELINE_CASES.characters)
    await writeJson(productBaselineFixtureRoot, `characters/${id}.json`, capture.characters[id]);
  for (const { id } of PRODUCT_BASELINE_CASES.lightCones)
    await writeJson(productBaselineFixtureRoot, `light-cones/${id}.json`, capture.lightCones[id]);
  for (const { id } of PRODUCT_BASELINE_CASES.relics)
    await writeJson(productBaselineFixtureRoot, `relics/${id}.json`, capture.relics[id]);
  for (const { id } of PRODUCT_BASELINE_CASES.enemies)
    await writeJson(productBaselineFixtureRoot, `enemies/${id}.json`, capture.enemies[id]);
  for (const { mode, groupId } of PRODUCT_BASELINE_CASES.endgame)
    await writeJson(
      productBaselineFixtureRoot,
      `endgame/${mode}/${groupId}.json`,
      capture.endgame.modes[mode]?.[String(groupId)]
    );
  await writeJson(
    productBaselineFixtureRoot,
    'endgame/boundaries.json',
    capture.endgame.boundaries
  );
  await writeJson(productBaselineFixtureRoot, 'homepage.json', capture.homepage);
  await writeJson(productBaselineFixtureRoot, 'search.json', capture.search);
  await assertProductBaselineFixtureTree();
}

export async function writeSearchProductBaselineFixture(
  capture: ProductBaselineCapture,
  approvalReason: string
): Promise<void> {
  if (!approvalReason.trim()) throw new Error('Product baseline approval reason must not be empty');
  assertWritableFixtureRoot(productBaselineFixtureRoot);
  await writeJson(productBaselineFixtureRoot, 'metadata.json', {
    ...capture.metadata,
    approvalReason: approvalReason.trim()
  });
  await writeJson(productBaselineFixtureRoot, 'search.json', capture.search);
  await assertProductBaselineFixtureTree();
}

export async function readProductBaselineFixtures(
  root = productBaselineFixtureRoot
): Promise<ProductBaselineCapture> {
  await assertProductBaselineFixtureTree(root);
  const readArea = async (
    domain: 'characters' | 'light-cones' | 'relics' | 'enemies',
    cases: readonly { id: string }[]
  ) =>
    Object.fromEntries(
      await Promise.all(
        cases.map(async ({ id }) => [id, await readJson(root, `${domain}/${id}.json`)])
      )
    );
  const modes: ProductBaselineCapture['endgame']['modes'] = {};
  for (const { mode, groupId } of PRODUCT_BASELINE_CASES.endgame) {
    modes[mode] ??= {};
    modes[mode][String(groupId)] = await readJson(root, `endgame/${mode}/${groupId}.json`);
  }
  return {
    metadata: await readJson(root, 'metadata.json'),
    characters: await readArea('characters', PRODUCT_BASELINE_CASES.characters),
    lightCones: await readArea('light-cones', PRODUCT_BASELINE_CASES.lightCones),
    relics: await readArea('relics', PRODUCT_BASELINE_CASES.relics),
    enemies: await readArea('enemies', PRODUCT_BASELINE_CASES.enemies),
    endgame: {
      modes,
      boundaries: await readJson(root, 'endgame/boundaries.json')
    },
    homepage: await readJson(root, 'homepage.json'),
    search: await readJson(root, 'search.json')
  };
}
