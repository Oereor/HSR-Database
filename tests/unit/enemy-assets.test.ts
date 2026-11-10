import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCurlResponse } from '../../scripts/assets/enemies/curl';
import { updateEnemyAssets } from '../../scripts/assets/enemies/sync';
import {
  ENEMY_ASSET_SCHEMA_VERSION,
  ENEMY_IMAGE_DIRECTORIES,
  ENEMY_IMAGE_TYPES
} from '../../src/lib/domain/enemy-asset-paths';
import {
  catalogFingerprint,
  inspectWebp,
  readEnemyRequirements,
  validateSnapshot,
  type EnemyAssetManifest,
  type EnemyRequirement
} from '../../scripts/assets/enemies/snapshot';
import { fetchWithRetry, parseNanokaMonster } from '../../scripts/assets/enemies/network';
import { siteRoot } from '../../scripts/data/paths';
import { loadEnemyImageMaps } from '../../src/lib/server/enemy-assets';

let webp: Buffer;
const roots: string[] = [];
beforeAll(async () => {
  webp = await sharp({
    create: { width: 12, height: 16, channels: 4, background: { r: 30, g: 60, b: 90, alpha: 1 } }
  })
    .webp()
    .toBuffer();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  );
});

async function fixture(
  label: string,
  ids = ['1']
): Promise<{
  root: string;
  catalog: string;
  requirements: EnemyRequirement[];
}> {
  const parent = path.join(
    siteRoot,
    '.upstream',
    'test-temp',
    `enemy-${label}-${crypto.randomUUID()}`
  );
  roots.push(parent);
  const root = path.join(parent, 'generated-enemy-assets');
  for (const directory of Object.values(ENEMY_IMAGE_DIRECTORIES))
    await mkdir(path.join(root, directory), { recursive: true });
  const catalog = path.join(parent, 'catalog.json');
  const requirements = ids.map((id) => ({ id, name: `Enemy ${id}` }));
  await writeFile(catalog, JSON.stringify(requirements));
  await writeFile(path.join(root, 'README.md'), 'Fixture snapshot\n');
  return { root, catalog, requirements };
}

async function snapshot(
  f: Awaited<ReturnType<typeof fixture>>,
  mappings: Record<string, string>,
  version = '1'
): Promise<void> {
  const imageIds = [...new Set(Object.values(mappings))];
  const images: EnemyAssetManifest['images'] = { MonsterMiddleIcon: {}, MonsterFigure: {} };
  for (const type of ENEMY_IMAGE_TYPES) {
    for (const id of imageIds) {
      const file = path.join(f.root, ENEMY_IMAGE_DIRECTORIES[type], `Monster_${id}.webp`);
      await writeFile(file, webp);
      images[type][id] = await inspectWebp(file);
    }
  }
  const manifest: EnemyAssetManifest = {
    schemaVersion: ENEMY_ASSET_SCHEMA_VERSION,
    source: 'static.nanoka.cc',
    version,
    generatedAt: '2026-01-01T00:00:00.000Z',
    catalogFingerprint: catalogFingerprint(f.requirements),
    monsters: Object.fromEntries(
      Object.entries(mappings).map(([id, imageId]) => [
        id,
        {
          name: `Enemy ${id}`,
          imageId
        }
      ])
    ),
    unavailable: Object.fromEntries(
      f.requirements
        .filter(({ id }) => !(id in mappings))
        .map(({ id, name }) => [id, { name, kind: 'missing-monster-json', status: 404 }])
    ),
    images
  };
  await writeFile(path.join(f.root, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function provider(
  options: {
    version?: string;
    ids?: Record<string, string | number>;
    missingImage?: string;
    imageFailure?: number;
    failure?: number;
  } = {}
) {
  const counts = { details: 0, images: 0 };
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/manifest.json'))
      return new Response(JSON.stringify({ hsr: { latest: options.version ?? '1' } }));
    if (url.includes('/zh/monster/')) {
      counts.details += 1;
      const id = /\/(\d+)\.json$/.exec(url)?.[1] ?? '';
      if (options.failure) return new Response('', { status: options.failure });
      if (!(id in (options.ids ?? {}))) return new Response('', { status: 404 });
      const value = options.ids![id];
      return new Response(
        JSON.stringify({
          id,
          name: `Enemy ${id}`,
          ...(typeof value === 'string' ? { image_path: `Monster_${value}.png` } : {})
        })
      );
    }
    if (!/\/assets\/hsr\/(monstermiddleicon|monsterfigure)\//.test(url))
      throw new Error(`Unexpected URL: ${url}`);
    counts.images += 1;
    if (options.imageFailure) return new Response('', { status: options.imageFailure });
    if (options.missingImage && url.endsWith(options.missingImage))
      return new Response('', { status: 404 });
    return new Response(Uint8Array.from(webp).buffer, {
      headers: { 'content-type': 'image/webp' }
    });
  });
  return { fetchImpl, counts };
}

const update = (f: Awaited<ReturnType<typeof fixture>>, fetchImpl: typeof fetch) =>
  updateEnemyAssets({
    assetRoot: f.root,
    catalogFile: f.catalog,
    baseUrl: 'https://example.test',
    fetchImpl,
    maxRetries: 0,
    log: () => undefined
  });

describe('offline tracked enemy snapshot', () => {
  it('catalog fingerprint depends on sorted IDs, not names or order', () => {
    expect(
      catalogFingerprint([
        { id: '2', name: 'A' },
        { id: '1', name: 'B' }
      ])
    ).toBe(
      catalogFingerprint([
        { id: '1', name: 'X' },
        { id: '2', name: 'Y' }
      ])
    );
    expect(() =>
      catalogFingerprint([
        { id: '1', name: 'A' },
        { id: '1', name: 'B' }
      ])
    ).toThrow();
  });

  it('validates coverage, per-type digests and exact file sets', async () => {
    const f = await fixture('validation', ['1', '2']);
    await snapshot(f, { '1': '7000', '2': '7000' });
    expect(await validateSnapshot(f.requirements, f.root)).toMatchObject({ mapped: 2, images: 2 });
    const index = path.join(f.root, 'index.json');
    const original = await readFile(index, 'utf8');
    const missingMetadata = JSON.parse(original);
    delete missingMetadata.images.MonsterMiddleIcon['7000'];
    await writeFile(index, JSON.stringify(missingMetadata));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/metadata/);
    await writeFile(index, original);
    await writeFile(path.join(f.root, 'figures', 'Monster_9999.webp'), webp);
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/文件集合/);
    await rm(path.join(f.root, 'figures', 'Monster_9999.webp'));
    await writeFile(path.join(f.root, 'figures', 'Monster_7000.webp'), Buffer.from('not a WebP'));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/图片头部|WebP/);
    await writeFile(path.join(f.root, 'figures', 'Monster_7000.webp'), webp);
    const wrong = JSON.parse(original);
    wrong.images.MonsterFigure['7000'].sha256 = createHash('sha256').update('wrong').digest('hex');
    await writeFile(index, JSON.stringify(wrong));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/sha256/);
    await writeFile(index, original);
    await rm(path.join(f.root, 'figures', 'Monster_7000.webp'));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/文件集合/);
    await writeFile(path.join(f.root, 'figures', 'Monster_7000.webp'), webp);
    await expect(
      validateSnapshot([...f.requirements, { id: '3', name: 'New' }], f.root)
    ).rejects.toThrow(/fingerprint/);
  });

  it('requires a manifest and correctly sorted unique catalog', async () => {
    const f = await fixture('missing');
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(
      /tracked enemy snapshot invalid/
    );
    await writeFile(
      f.catalog,
      JSON.stringify([
        { id: '2', name: 'B' },
        { id: '1', name: 'A' }
      ])
    );
    expect((await readEnemyRequirements(f.catalog)).map(({ id }) => id)).toEqual(['1', '2']);
    await writeFile(
      f.catalog,
      JSON.stringify([
        { id: '1', name: 'A' },
        { id: '1', name: 'B' }
      ])
    );
    await expect(readEnemyRequirements(f.catalog)).rejects.toThrow(/重复 ID/);
  });
});

describe('incremental network maintenance', () => {
  it('no-change check preserves manifest bytes and reuses every image', async () => {
    const f = await fixture('nochange', ['1', '2']);
    await snapshot(f, { '1': '7000', '2': '7000' });
    const before = await readFile(path.join(f.root, 'index.json'));
    const network = provider();
    const result = await update(f, network.fetchImpl);
    expect(result.stats).toMatchObject({
      changed: false,
      detailRequests: 0,
      imageDownloads: 0,
      reusedImages: 2
    });
    expect(network.counts).toEqual({ details: 0, images: 0 });
    expect(await readFile(path.join(f.root, 'index.json'))).toEqual(before);
  });

  it('same version resolves only new ID and reuses a shared image', async () => {
    const f = await fixture('new', ['1']);
    await snapshot(f, { '1': '7000' });
    f.requirements.push({ id: '2', name: 'Enemy 2' });
    await writeFile(f.catalog, JSON.stringify(f.requirements));
    const network = provider({ ids: { '2': '7000' } });
    const result = await update(f, network.fetchImpl);
    expect(result.stats).toMatchObject({
      detailRequests: 1,
      imageDownloads: 0,
      reusedImages: 2,
      newTemplateIds: ['2'],
      images: 2
    });
    await expect(validateSnapshot(f.requirements, f.root)).resolves.toBeDefined();
  });

  it('version change refreshes mapping but downloads only changed image and prunes old one', async () => {
    const f = await fixture('mapping');
    await snapshot(f, { '1': '7000' });
    const network = provider({ version: '2', ids: { '1': '8000' } });
    const result = await update(f, network.fetchImpl);
    expect(result.stats).toMatchObject({
      detailRequests: 1,
      imageDownloads: 2,
      changedMappings: ['1'],
      newImages: ['MonsterFigure/8000', 'MonsterMiddleIcon/8000'],
      prunedImages: ['MonsterFigure/7000', 'MonsterMiddleIcon/7000']
    });
    expect(await readdir(path.join(f.root, 'figures'))).toEqual(['Monster_8000.webp']);
  });

  it('version-only refresh produces no diff and retains source version/timestamp', async () => {
    const f = await fixture('version-only');
    await snapshot(f, { '1': '7000' });
    const before = await readFile(path.join(f.root, 'index.json'));
    const network = provider({ version: '2', ids: { '1': '7000' } });
    const result = await update(f, network.fetchImpl);
    expect(result.stats).toMatchObject({ changed: false, detailRequests: 1, imageDownloads: 0 });
    expect(await readFile(path.join(f.root, 'index.json'))).toEqual(before);
  });

  it('repairs corrupt images and leaves original snapshot intact on operational failure', async () => {
    const f = await fixture('repair');
    await snapshot(f, { '1': '7000' });
    await writeFile(path.join(f.root, 'figures', 'Monster_7000.webp'), 'corrupt');
    const corrupt = await readFile(path.join(f.root, 'figures', 'Monster_7000.webp'));
    const before = await readFile(path.join(f.root, 'index.json'));
    const failure = provider({ imageFailure: 503 });
    await expect(update(f, failure.fetchImpl)).rejects.toThrow(/operational failure/);
    expect(await readFile(path.join(f.root, 'index.json'))).toEqual(before);
    expect(await readFile(path.join(f.root, 'figures', 'Monster_7000.webp'))).toEqual(corrupt);
    const success = provider();
    const result = await update(f, success.fetchImpl);
    expect(result.stats).toMatchObject({
      detailRequests: 0,
      imageDownloads: 1,
      reusedImages: 1,
      repairedImages: ['MonsterFigure/7000']
    });
    expect(success.fetchImpl).toHaveBeenCalledWith(
      'https://example.test/assets/hsr/monsterfigure/Monster_7000.webp',
      expect.anything()
    );
    await expect(validateSnapshot(f.requirements, f.root)).resolves.toBeDefined();
  });

  it('records a Figure 404 independently and retries only that type on the same version', async () => {
    const f = await fixture('unavailable', ['1', '2']);
    await snapshot(f, {});
    const result = await update(
      f,
      provider({
        ids: { '1': '8000', '2': '8000' },
        missingImage: '/monsterfigure/Monster_8000.webp'
      }).fetchImpl
    );
    expect(result.stats).toMatchObject({ detailRequests: 2, imageDownloads: 2, unavailable: 0 });
    const { manifest } = await validateSnapshot(f.requirements, f.root);
    expect(manifest.images.MonsterFigure['8000']).toBeNull();
    expect(manifest.images.MonsterMiddleIcon['8000']).toBeTruthy();
    const retry = await update(f, provider().fetchImpl);
    expect(retry.stats).toMatchObject({ detailRequests: 0, imageDownloads: 1, reusedImages: 1 });
  });
});

it('transport validates detail identity and retries rate limiting', async () => {
  const marker = '\n__MARKER__';
  expect(
    parseCurlResponse(Buffer.from(`body${marker}429\timage/webp\t3`), marker).metadata.status
  ).toBe(429);
  const calls = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 429 }))
    .mockResolvedValueOnce(new Response('ok'));
  await expect(
    fetchWithRetry('https://example.test', { fetchImpl: calls, sleep: async () => undefined })
  ).resolves.toMatchObject({ status: 200 });
  expect(calls).toHaveBeenCalledTimes(2);
  expect(() =>
    parseNanokaMonster(
      { id: 2, name: 'Other', image_path: 'Monster_7000.png' },
      { id: '1', name: 'A' }
    )
  ).toThrow(/id 不匹配/);
});

it('resolves the two image types independently with a MiddleIcon fallback for the hero', async () => {
  const f = await fixture('resolver', ['1', '2', '3']);
  await snapshot(f, { '1': '7000', '2': '8000', '3': '9000' });
  await rm(path.join(f.root, 'figures', 'Monster_8000.webp'));
  await rm(path.join(f.root, 'icons', 'Monster_9000.webp'));

  const { cards, heroes } = await loadEnemyImageMaps({
    staticRoot: path.dirname(f.root),
    warn: vi.fn()
  });
  expect(cards).toEqual(
    new Map([
      [1, '/generated-enemy-assets/icons/Monster_7000.webp'],
      [2, '/generated-enemy-assets/icons/Monster_8000.webp']
    ])
  );
  expect(heroes).toEqual(
    new Map([
      [1, '/generated-enemy-assets/figures/Monster_7000.webp'],
      [2, '/generated-enemy-assets/icons/Monster_8000.webp'],
      [3, '/generated-enemy-assets/figures/Monster_9000.webp']
    ])
  );
});
