import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCurlResponse } from '../../scripts/assets/enemies/curl';
import { updateEnemyAssets } from '../../scripts/assets/enemies/sync';
import {
  SCHEMA_VERSION,
  catalogFingerprint,
  enemyAssetRoot,
  inspectWebp,
  readEnemyRequirements,
  validateSnapshot,
  type EnemyAssetManifest,
  type EnemyRequirement
} from '../../scripts/assets/enemies/snapshot';
import { fetchWithRetry, parseNanokaMonster } from '../../scripts/assets/enemies/network';
import { loadEnemyPortraitMap } from '../../src/lib/server/enemy-assets';

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
  const root = path.join(enemyAssetRoot, `.test-${label}-${crypto.randomUUID()}`);
  roots.push(root);
  await mkdir(path.join(root, 'icons'), { recursive: true });
  const catalog = path.join(root, 'catalog.json');
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
  const images = Object.fromEntries(
    await Promise.all(
      imageIds.map(async (id) => {
        await writeFile(path.join(f.root, 'icons', `Monster_${id}.webp`), webp);
        return [id, await inspectWebp(path.join(f.root, 'icons', `Monster_${id}.webp`))];
      })
    )
  );
  const manifest: EnemyAssetManifest = {
    schemaVersion: SCHEMA_VERSION,
    source: 'static.nanoka.cc',
    version,
    generatedAt: '2026-01-01T00:00:00.000Z',
    resourceType: 'MonsterMiddleIcon',
    catalogFingerprint: catalogFingerprint(f.requirements),
    monsters: Object.fromEntries(
      Object.entries(mappings).map(([id, imageId]) => [
        id,
        {
          name: `Enemy ${id}`,
          imageId,
          icon: `/generated-enemy-assets/icons/Monster_${imageId}.webp`
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
    image404?: string;
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
    counts.images += 1;
    if (url.endsWith(`Monster_${options.image404}.webp`)) return new Response('', { status: 404 });
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

  it('validates coverage, canonical URLs, image digests and exact file set', async () => {
    const f = await fixture('validation', ['1', '2']);
    await snapshot(f, { '1': '7000', '2': '7000' });
    expect(await validateSnapshot(f.requirements, f.root)).toMatchObject({ mapped: 2, images: 1 });
    const index = path.join(f.root, 'index.json');
    const original = await readFile(index, 'utf8');
    await writeFile(index, original.replace('Monster_7000.webp', 'monster_7000.webp'));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/canonical/);
    await writeFile(index, original);
    await writeFile(path.join(f.root, 'icons', 'Monster_9999.webp'), webp);
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/文件集合/);
    await rm(path.join(f.root, 'icons', 'Monster_9999.webp'));
    await writeFile(path.join(f.root, 'icons', 'Monster_7000.webp'), Buffer.from('not a WebP'));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/图片头部|WebP/);
    await writeFile(path.join(f.root, 'icons', 'Monster_7000.webp'), webp);
    const wrong = JSON.parse(original);
    wrong.images['7000'].sha256 = createHash('sha256').update('wrong').digest('hex');
    await writeFile(index, JSON.stringify(wrong));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/sha256/);
    await writeFile(index, original);
    await rm(path.join(f.root, 'icons', 'Monster_7000.webp'));
    await expect(validateSnapshot(f.requirements, f.root)).rejects.toThrow(/文件集合/);
    await writeFile(path.join(f.root, 'icons', 'Monster_7000.webp'), webp);
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
      reusedImages: 1
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
      reusedImages: 1,
      newTemplateIds: ['2'],
      images: 1
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
      imageDownloads: 1,
      changedMappings: ['1'],
      newImages: ['8000'],
      prunedImages: ['7000']
    });
    expect(await readdir(path.join(f.root, 'icons'))).toEqual(['Monster_8000.webp']);
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
    await writeFile(path.join(f.root, 'icons', 'Monster_7000.webp'), 'corrupt');
    const corrupt = await readFile(path.join(f.root, 'icons', 'Monster_7000.webp'));
    const failure = provider({ failure: 403, version: '2', ids: { '1': '7000' } });
    await expect(update(f, failure.fetchImpl)).rejects.toThrow(/operational failure/);
    expect(await readFile(path.join(f.root, 'icons', 'Monster_7000.webp'))).toEqual(corrupt);
    const success = provider();
    const result = await update(f, success.fetchImpl);
    expect(result.stats.repairedImages).toEqual(['7000']);
    await expect(validateSnapshot(f.requirements, f.root)).resolves.toBeDefined();
  });

  it('explicit provider 404 may become unavailable; 5xx never publishes', async () => {
    const f = await fixture('unavailable', ['1', '2']);
    await snapshot(f, { '1': '7000' });
    const before = await readFile(path.join(f.root, 'index.json'));
    await expect(update(f, provider({ failure: 503, version: '2' }).fetchImpl)).rejects.toThrow(
      /operational failure/
    );
    expect(await readFile(path.join(f.root, 'index.json'))).toEqual(before);
    const result = await update(
      f,
      provider({ ids: { '1': '7000', '2': '8000' }, image404: '8000' }).fetchImpl
    );
    expect(result.stats.unavailable).toBe(1);
    await expect(validateSnapshot(f.requirements, f.root)).resolves.toBeDefined();
  });
});

it('transport and runtime resolver preserve canonical behavior', async () => {
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
      { id: '1', name: 'A' },
      'https://example.test'
    )
  ).toThrow(/id 不匹配/);

  const f = await fixture('resolver');
  await snapshot(f, { '1': '7000' });
  const staticRoot = path.join(f.root, 'static');
  await mkdir(path.join(staticRoot, 'generated-enemy-assets', 'icons'), { recursive: true });
  await writeFile(
    path.join(staticRoot, 'generated-enemy-assets', 'index.json'),
    await readFile(path.join(f.root, 'index.json'))
  );
  await writeFile(
    path.join(staticRoot, 'generated-enemy-assets', 'icons', 'Monster_7000.webp'),
    webp
  );
  expect(
    (
      await loadEnemyPortraitMap({
        staticRoot,
        manifestPath: path.join(staticRoot, 'generated-enemy-assets', 'index.json'),
        warn: vi.fn()
      })
    ).get(1)
  ).toBe('/generated-enemy-assets/icons/Monster_7000.webp');
});
