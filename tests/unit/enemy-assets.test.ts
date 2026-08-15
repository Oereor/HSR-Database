import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCurlResponse } from '../../scripts/assets/enemies/curl';
import { syncEnemyAssets } from '../../scripts/assets/enemies/sync';
import { loadEnemyPortraitMap } from '../../src/lib/server/enemy-assets';
import {
  cleanEnemyTemporaryFiles,
  enemyAssetRoot,
  ensureEnemyIcon,
  extractImageId,
  fetchWithRetry,
  parseNanokaMonster,
  pruneEnemyIcons,
  readEnemyRequirements,
  validateWebpFile,
  type EnemyRequirement,
  type NanokaMonster
} from '../../scripts/assets/enemies/shared';

sharp.cache(false);

const testRoots: string[] = [];
let validWebp: Buffer;
let validWebpBody: ArrayBuffer;

beforeAll(async () => {
  validWebp = await sharp({
    create: {
      width: 16,
      height: 12,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 }
    }
  })
    .webp()
    .toBuffer();
  validWebpBody = Uint8Array.from(validWebp).buffer;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    testRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function testRoot(label: string): Promise<string> {
  const root = path.join(enemyAssetRoot, `.test-${label}-${crypto.randomUUID()}`);
  testRoots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

const requirement = (id: string, name = `敌人 ${id}`): EnemyRequirement => ({ id, name });

const monster = (imageId = '9001'): NanokaMonster => ({
  id: '1',
  name: '测试敌人',
  imageId,
  imagePath: `SpriteOutput/MonsterMiddleIcon/Monster_${imageId}.png`,
  detailUrl: 'https://example.test/detail/1.json',
  iconUrl: `https://example.test/Monster_${imageId}.webp`
});

describe('Nanoka 敌人头像同步核心', () => {
  it('curl transport 从二进制响应尾部解析状态、类型和 Retry-After', () => {
    const marker = '\n__MARKER__';
    const body = Buffer.from([0, 1, 2, 255]);
    const output = Buffer.concat([body, Buffer.from(`${marker}429\timage/webp\t3`, 'utf8')]);
    expect(parseCurlResponse(output, marker)).toEqual({
      body,
      metadata: { status: 429, contentType: 'image/webp', retryAfter: '3' }
    });
  });

  it('从网站敌人目录读取、排序并拒绝重复 canonical ID', async () => {
    const root = await testRoot('catalog');
    const catalog = path.join(root, 'enemies.json');
    await writeFile(
      catalog,
      JSON.stringify([
        { id: '20', name: '乙' },
        { id: '10', name: '甲' }
      ])
    );
    await expect(readEnemyRequirements(catalog)).resolves.toEqual([
      { id: '10', name: '甲' },
      { id: '20', name: '乙' }
    ]);
    await writeFile(
      catalog,
      JSON.stringify([
        { id: '10', name: '甲' },
        { id: '10', name: '重复' }
      ])
    );
    await expect(readEnemyRequirements(catalog)).rejects.toThrow(/重复 ID/);
  });

  it('按 Nanoka 约定提取 imageId，并严格校验详情 ID', () => {
    expect(extractImageId('SpriteOutput/MonsterMiddleIcon/Monster_123456.png')).toBe('123456');
    expect(extractImageId('no-number')).toBeUndefined();
    expect(
      parseNanokaMonster(
        { id: 1, name: '测试敌人', image_path: 'Monster_9001.png' },
        requirement('1'),
        'https://example.test/detail/1.json',
        'https://example.test'
      )
    ).toMatchObject({ id: '1', name: '测试敌人', imageId: '9001' });
    expect(() =>
      parseNanokaMonster(
        { id: 2, name: '错误对象', image_path: 'Monster_9001.png' },
        requirement('1'),
        'https://example.test/detail/1.json'
      )
    ).toThrow(/id 不匹配/);
    expect(() =>
      parseNanokaMonster(
        { id: 1, name: '缺图' },
        requirement('1'),
        'https://example.test/detail/1.json'
      )
    ).toThrow(/image_path/);
  });

  it('429/5xx 有限重试，404 不重试', async () => {
    const delays: number[] = [];
    const retryFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const response = await fetchWithRetry('https://example.test/retry', {
      fetchImpl: retryFetch,
      maxRetries: 3,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      }
    });
    expect(response.status).toBe(200);
    expect(retryFetch).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([0, 2000]);

    const missingFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const missing = await fetchWithRetry('https://example.test/missing', {
      fetchImpl: missingFetch,
      sleep: async () => undefined
    });
    expect(missing.status).toBe(404);
    expect(missingFetch).toHaveBeenCalledTimes(1);

    const networkFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      fetchWithRetry('https://example.test/network', {
        fetchImpl: networkFetch,
        maxRetries: 2,
        sleep: async () => undefined
      })
    ).rejects.toThrow(/example\.test\/network.*ECONNRESET/);
    expect(networkFetch).toHaveBeenCalledTimes(3);
  });

  it('WebP 使用临时文件落盘，支持有效缓存 skip 与 force 替换', async () => {
    const root = await testRoot('icon');
    const iconRoot = path.join(root, 'icons');
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response(validWebpBody, { headers: { 'content-type': 'image/webp' } }))
    );

    const created = await ensureEnemyIcon(monster(), { iconRoot, fetchImpl });
    expect(created.disposition).toBe('created');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const skipped = await ensureEnemyIcon(monster(), { iconRoot, fetchImpl });
    expect(skipped.disposition).toBe('skipped');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const replaced = await ensureEnemyIcon(monster(), { iconRoot, fetchImpl, force: true });
    expect(replaced.disposition).toBe('replaced');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(validateWebpFile(path.join(iconRoot, 'Monster_9001.webp'))).resolves.toMatchObject(
      {
        width: 16,
        height: 12
      }
    );
  });

  it('拒绝 HTML、空响应和不可接受的 Content-Type，且不留下临时文件', async () => {
    const root = await testRoot('invalid');
    const iconRoot = path.join(root, 'icons');
    for (const response of [
      new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
      new Response('', { headers: { 'content-type': 'image/webp' } }),
      new Response(validWebpBody, { headers: { 'content-type': 'text/plain' } })
    ]) {
      await expect(
        ensureEnemyIcon(monster(), {
          iconRoot,
          fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response)
        })
      ).rejects.toThrow();
    }
    await expect(stat(path.join(iconRoot, 'Monster_9001.webp'))).rejects.toBeDefined();
  });

  it('完整成功时按 imageId 去重并清理旧图', async () => {
    const root = await testRoot('complete');
    const catalog = path.join(root, 'catalog.json');
    const iconRoot = path.join(root, 'icons');
    await mkdir(iconRoot, { recursive: true });
    await writeFile(
      catalog,
      JSON.stringify([
        { id: '1', name: '本地甲' },
        { id: '2', name: '本地乙' }
      ])
    );
    await writeFile(path.join(iconRoot, 'Monster_9999.webp'), validWebp);
    let imageRequests = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/manifest.json'))
        return new Response(JSON.stringify({ hsr: { latest: '9.9.9' } }));
      if (url.endsWith('/monster.json')) return new Response(JSON.stringify([]));
      if (url.includes('/zh/monster/')) {
        const id = /\/(\d+)\.json$/.exec(url)?.[1];
        return new Response(
          JSON.stringify({ id, name: `Nanoka ${id}`, image_path: 'Monster_7000.png' })
        );
      }
      imageRequests += 1;
      return new Response(validWebpBody, { headers: { 'content-type': 'image/webp' } });
    });

    const result = await syncEnemyAssets({
      assetRoot: root,
      catalogFile: catalog,
      baseUrl: 'https://example.test',
      fetchImpl,
      log: () => undefined,
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });
    expect(result.failures).toEqual([]);
    expect(result.stats).toMatchObject({
      totalMonsterTemplateIds: 2,
      mappedMonsterTemplateIds: 2,
      uniqueImageIds: 1,
      downloadedImages: 1,
      prunedImages: 1
    });
    expect(imageRequests).toBe(1);
    expect(result.manifest.monsters).toEqual({
      '1': {
        name: 'Nanoka 1',
        imageId: '7000',
        icon: '/generated-enemy-assets/icons/Monster_7000.webp'
      },
      '2': {
        name: 'Nanoka 2',
        imageId: '7000',
        icon: '/generated-enemy-assets/icons/Monster_7000.webp'
      }
    });
    await expect(stat(path.join(iconRoot, 'Monster_9999.webp'))).rejects.toBeDefined();
  });

  it('部分失败仍生成成功 mapping、返回诊断且不清理旧图', async () => {
    const root = await testRoot('partial');
    const catalog = path.join(root, 'catalog.json');
    const iconRoot = path.join(root, 'icons');
    await mkdir(iconRoot, { recursive: true });
    await writeFile(
      catalog,
      JSON.stringify([
        { id: '1', name: '本地甲' },
        { id: '2', name: '本地乙' }
      ])
    );
    await writeFile(path.join(iconRoot, 'Monster_9999.webp'), validWebp);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/manifest.json'))
        return new Response(JSON.stringify({ hsr: { latest: '9.9.9' } }));
      if (url.endsWith('/monster.json')) return new Response(JSON.stringify([]));
      if (url.endsWith('/2.json')) return new Response('', { status: 404 });
      if (url.endsWith('/1.json'))
        return new Response(
          JSON.stringify({ id: '1', name: 'Nanoka 1', image_path: 'Monster_7000.png' })
        );
      return new Response(validWebpBody, { headers: { 'content-type': 'image/webp' } });
    });

    const result = await syncEnemyAssets({
      assetRoot: root,
      catalogFile: catalog,
      baseUrl: 'https://example.test',
      fetchImpl,
      log: () => undefined
    });
    expect(result.manifest.monsters).toHaveProperty('1');
    expect(result.manifest.monsters).not.toHaveProperty('2');
    expect(result.failures).toMatchObject([
      { monsterTemplateId: '2', kind: 'missing-monster-json', status: 404 }
    ]);
    expect(result.stats.prunedImages).toBe(0);
    await expect(stat(path.join(iconRoot, 'Monster_9999.webp'))).resolves.toBeDefined();
  });

  it('清理函数只删除未引用的标准命名 WebP', async () => {
    const root = await testRoot('prune');
    const iconRoot = path.join(root, 'icons');
    await mkdir(iconRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(iconRoot, 'Monster_1.webp'), validWebp),
      writeFile(path.join(iconRoot, 'Monster_2.webp'), validWebp),
      writeFile(path.join(iconRoot, 'manual.webp'), validWebp)
    ]);
    await expect(pruneEnemyIcons(new Set(['1']), iconRoot)).resolves.toBe(1);
    await expect(stat(path.join(iconRoot, 'Monster_1.webp'))).resolves.toBeDefined();
    await expect(stat(path.join(iconRoot, 'Monster_2.webp'))).rejects.toBeDefined();
    await expect(stat(path.join(iconRoot, 'manual.webp'))).resolves.toBeDefined();
  });

  it('只清理同步器命名的遗留临时 WebP', async () => {
    const root = await testRoot('temporary');
    const iconRoot = path.join(root, 'icons');
    await mkdir(iconRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(iconRoot, '.Monster_1.tmp-deadbeef.webp'), validWebp),
      writeFile(path.join(iconRoot, 'Monster_1.webp'), validWebp),
      writeFile(path.join(iconRoot, '.manual.tmp.webp'), validWebp)
    ]);
    await expect(cleanEnemyTemporaryFiles(iconRoot)).resolves.toBe(1);
    await expect(stat(path.join(iconRoot, '.Monster_1.tmp-deadbeef.webp'))).rejects.toBeDefined();
    await expect(stat(path.join(iconRoot, 'Monster_1.webp'))).resolves.toBeDefined();
    await expect(stat(path.join(iconRoot, '.manual.tmp.webp'))).resolves.toBeDefined();
  });

  it('图片 HTTP 错误保留精确 status', async () => {
    const root = await testRoot('http');
    await expect(
      ensureEnemyIcon(monster(), {
        iconRoot: path.join(root, 'icons'),
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }))
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('Endgame 本地敌人立绘 resolver', () => {
  it('按 MonsterTemplateID 读取本地映射并复用共享 imageId', async () => {
    const root = await testRoot('resolver');
    const staticRoot = path.join(root, 'static');
    const assetRoot = path.join(staticRoot, 'generated-enemy-assets');
    const iconRoot = path.join(assetRoot, 'icons');
    await mkdir(iconRoot, { recursive: true });
    await writeFile(path.join(iconRoot, 'Monster_7000.webp'), validWebp);
    await writeFile(
      path.join(assetRoot, 'index.json'),
      JSON.stringify({
        schemaVersion: 1,
        resourceType: 'MonsterMiddleIcon',
        monsters: {
          '1': {
            name: '本地甲',
            imageId: '7000',
            icon: '/generated-enemy-assets/icons/Monster_7000.webp'
          },
          '2': {
            name: '本地乙',
            imageId: '7000',
            icon: '/generated-enemy-assets/icons/Monster_7000.webp'
          }
        }
      })
    );
    const portraits = await loadEnemyPortraitMap({
      staticRoot,
      manifestPath: path.join(assetRoot, 'index.json'),
      warn: vi.fn()
    });
    expect(portraits.get(1)).toBe('/generated-enemy-assets/icons/Monster_7000.webp');
    expect(portraits.get(2)).toBe('/generated-enemy-assets/icons/Monster_7000.webp');
    expect(new Set(portraits.values()).size).toBe(1);
  });

  it('缺少 manifest、非法路径或缺图时返回安全降级', async () => {
    const root = await testRoot('resolver-missing');
    const staticRoot = path.join(root, 'static');
    const assetRoot = path.join(staticRoot, 'generated-enemy-assets');
    await mkdir(assetRoot, { recursive: true });
    const warn = vi.fn();
    await expect(
      loadEnemyPortraitMap({
        staticRoot,
        manifestPath: path.join(assetRoot, 'missing.json'),
        warn
      })
    ).resolves.toHaveProperty('size', 0);
    await writeFile(
      path.join(assetRoot, 'index.json'),
      JSON.stringify({
        schemaVersion: 1,
        resourceType: 'MonsterMiddleIcon',
        monsters: {
          '1': { name: '越界', imageId: '1', icon: '/outside/Monster_1.webp' },
          '2': {
            name: '缺图',
            imageId: '2',
            icon: '/generated-enemy-assets/icons/Monster_2.webp'
          }
        }
      })
    );
    const portraits = await loadEnemyPortraitMap({
      staticRoot,
      manifestPath: path.join(assetRoot, 'index.json'),
      warn
    });
    expect(portraits.size).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});
