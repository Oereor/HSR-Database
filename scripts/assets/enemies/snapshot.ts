import { createHash } from 'node:crypto';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  ENEMY_ASSET_DIRECTORY,
  ENEMY_ASSET_SCHEMA_VERSION,
  ENEMY_IMAGE_DIRECTORIES,
  ENEMY_IMAGE_TYPES,
  enemyImageFileName,
  type EnemyImageType
} from '../../../src/lib/domain/enemy-asset-paths.js';
import type { CatalogEntry } from '../../../src/lib/domain/types.js';
import { generatedRoot, siteRoot } from '../../data/paths.js';

sharp.cache(false);
export const SANITY_CHECK_IDS = ['4064012', '1004014', '1004026', '4034013'] as const;
export const enemyAssetRoot = path.join(siteRoot, 'static', ENEMY_ASSET_DIRECTORY);
export const enemyCatalogPath = path.join(
  generatedRoot,
  'views',
  'zh-CN',
  'catalogs',
  'enemies.json'
);

export interface EnemyRequirement {
  id: string;
  name: string;
}
export interface EnemyAssetEntry {
  name: string;
  imageId: string;
}
export interface UnavailableEntry {
  name: string;
  kind: 'missing-monster-json' | 'missing-image-path';
  status?: number;
}
export interface ImageDigest {
  size: number;
  sha256: string;
}
export interface EnemyAssetManifest {
  schemaVersion: typeof ENEMY_ASSET_SCHEMA_VERSION;
  source: 'static.nanoka.cc';
  version: string;
  generatedAt: string;
  catalogFingerprint: string;
  monsters: Record<string, EnemyAssetEntry>;
  unavailable: Record<string, UnavailableEntry>;
  images: Record<EnemyImageType, Record<string, ImageDigest | null>>;
}
export interface SnapshotValidation {
  manifest: EnemyAssetManifest;
  mapped: number;
  unavailable: number;
  images: number;
  bytes: number;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const numericId = (value: unknown): value is string =>
  typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);

export function isEnemyAssetEntry(value: unknown): value is EnemyAssetEntry {
  const entry = record(value);
  return typeof entry?.name === 'string' && !!entry.name.trim() && numericId(entry.imageId);
}

export function catalogFingerprint(requirements: readonly EnemyRequirement[]): string {
  const ids = requirements.map(({ id }) => id).sort((a, b) => a.localeCompare(b));
  if (new Set(ids).size !== ids.length || ids.some((id) => !numericId(id)))
    throw new Error('enemy catalog 包含非法或重复 ID');
  return createHash('sha256')
    .update(`${ids.join('\n')}\n`)
    .digest('hex');
}

export async function readEnemyRequirements(file = enemyCatalogPath): Promise<EnemyRequirement[]> {
  let values: unknown;
  try {
    values = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取 enemy catalog：${file}；请先运行 pnpm data:ensure`, { cause: error });
  }
  if (!Array.isArray(values)) throw new Error('enemy catalog 不是数组');
  const requirements = values.map((value, index) => {
    const entry = record(value) as (CatalogEntry & Record<string, unknown>) | undefined;
    const id = typeof entry?.id === 'number' ? String(entry.id) : entry?.id;
    if (!numericId(id) || typeof entry?.name !== 'string' || !entry.name.trim())
      throw new Error(`enemy catalog 第 ${index + 1} 项缺少合法 id/name`);
    return { id, name: entry.name.trim() };
  });
  catalogFingerprint(requirements);
  return requirements.sort((a, b) => a.id.localeCompare(b.id));
}

export function parseManifest(value: unknown): EnemyAssetManifest {
  const m = record(value);
  const images = record(m?.images);
  if (
    !m ||
    m.schemaVersion !== ENEMY_ASSET_SCHEMA_VERSION ||
    m.source !== 'static.nanoka.cc' ||
    typeof m.version !== 'string' ||
    !m.version.trim() ||
    typeof m.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(m.generatedAt)) ||
    typeof m.catalogFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(m.catalogFingerprint) ||
    !record(m.monsters) ||
    !record(m.unavailable) ||
    !images ||
    Object.keys(images).length !== ENEMY_IMAGE_TYPES.length ||
    ENEMY_IMAGE_TYPES.some((type) => !record(images[type]))
  )
    throw new Error('tracked enemy snapshot invalid: manifest schema/source/metadata 不匹配');
  return m as unknown as EnemyAssetManifest;
}

export async function readManifest(root = enemyAssetRoot): Promise<EnemyAssetManifest> {
  try {
    return parseManifest(JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8')));
  } catch (error) {
    throw new Error(
      `tracked enemy snapshot invalid: index.json 缺失或损坏：${(error as Error).message}`,
      { cause: error }
    );
  }
}

export async function inspectWebp(file: string): Promise<ImageDigest> {
  const fileStat = await stat(file);
  if (!fileStat.isFile() || fileStat.size <= 0) throw new Error('图片不是非空普通文件');
  const handle = await open(file, 'r');
  let header: Buffer;
  try {
    header = Buffer.alloc(12);
    if ((await handle.read(header, 0, 12, 0)).bytesRead !== 12) throw new Error('图片头部过短');
  } finally {
    await handle.close();
  }
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WEBP')
    throw new Error('缺少 WebP 文件签名');
  const metadata = await sharp(file).metadata();
  if (
    metadata.format !== 'webp' ||
    !metadata.width ||
    !metadata.height ||
    metadata.width <= 0 ||
    metadata.height <= 0
  )
    throw new Error('Sharp 无法确认 WebP 尺寸');
  return {
    size: fileStat.size,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
  };
}

export async function validateSnapshot(
  requirements: readonly EnemyRequirement[],
  root = enemyAssetRoot
): Promise<SnapshotValidation> {
  const fail = (message: string): never => {
    throw new Error(`tracked enemy snapshot invalid: ${message}`);
  };
  const manifest = await readManifest(root);
  if (manifest.catalogFingerprint !== catalogFingerprint(requirements))
    fail('catalog fingerprint 不匹配');
  const required = new Set(requirements.map(({ id }) => id));
  const mapped = Object.entries(manifest.monsters);
  const unavailable = Object.entries(manifest.unavailable);
  if (
    mapped.length + unavailable.length !== required.size ||
    mapped.some(([id]) => !required.has(id) || id in manifest.unavailable) ||
    unavailable.some(([id]) => !required.has(id))
  )
    fail('manifest 未精确覆盖 enemy catalog');
  if (required.size && !mapped.length) fail('非空 catalog 没有图片映射');
  const images = new Set<string>();
  for (const [id, entry] of mapped) {
    if (!isEnemyAssetEntry(entry)) fail(`无效 mapping：${id}`);
    images.add(entry.imageId);
  }
  for (const [id, entry] of unavailable) {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      !['missing-monster-json', 'missing-image-path'].includes(entry.kind) ||
      (entry.status !== undefined && (!Number.isInteger(entry.status) || entry.status !== 404))
    )
      fail(`无效 unavailable 条目：${id}`);
  }
  let fileCount = 0;
  let bytes = 0;
  for (const type of ENEMY_IMAGE_TYPES) {
    const metadata = Object.entries(manifest.images[type]);
    if (metadata.length !== images.size || metadata.some(([id]) => !images.has(id)))
      fail(`${type} images metadata 与映射不一致`);
    const directory = ENEMY_IMAGE_DIRECTORIES[type];
    const imageRoot = path.join(root, directory);
    const available = metadata.filter(([, digest]) => digest !== null);
    const expectedNames = new Set(available.map(([id]) => enemyImageFileName(id)));
    const entries = await readdir(imageRoot, { withFileTypes: true }).catch(() =>
      fail(`${directory} 目录缺失`)
    );
    if (
      entries.length !== expectedNames.size ||
      entries.some((entry) => !entry.isFile() || !expectedNames.has(entry.name))
    )
      fail(`${directory} 文件集合或文件名大小写不匹配`);
    for (const [id, value] of available) {
      const declared = record(value);
      if (
        !declared ||
        !Number.isSafeInteger(declared.size) ||
        (declared.size as number) <= 0 ||
        typeof declared.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(declared.sha256)
      )
        return fail(`图片 metadata 无效：${type}/${id}`);
      const actual = await inspectWebp(path.join(imageRoot, enemyImageFileName(id))).catch(
        (error: Error) => fail(`图片 ${type}/${id} 无效：${error.message}`)
      );
      if (declared.size !== actual.size || declared.sha256 !== actual.sha256)
        fail(`图片 ${type}/${id} size/sha256 不匹配`);
      bytes += actual.size;
    }
    fileCount += available.length;
  }
  const hasImage = (imageId: string) =>
    ENEMY_IMAGE_TYPES.some((type) => manifest.images[type][imageId]);
  if (required.size && !fileCount) fail('非空 catalog 没有可用图片');
  for (const id of SANITY_CHECK_IDS)
    if (required.has(id) && !hasImage(manifest.monsters[id]?.imageId))
      fail(`sanity-check enemy 缺失：${id}`);
  const availableTemplates = mapped.filter(([, entry]) => hasImage(entry.imageId)).length;
  return {
    manifest,
    mapped: availableTemplates,
    unavailable: required.size - availableTemplates,
    images: fileCount,
    bytes
  };
}
