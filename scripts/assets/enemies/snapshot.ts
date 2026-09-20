import { createHash } from 'node:crypto';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { CatalogEntry } from '../../../src/lib/domain/types.js';
import { generatedRoot, siteRoot } from '../../data/paths.js';

export const SCHEMA_VERSION = 3 as const;
sharp.cache(false);
export const SANITY_CHECK_IDS = ['4064012', '1004014', '1004026', '4034013'] as const;
export const enemyAssetRoot = path.join(siteRoot, 'static', 'generated-enemy-assets');
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
  icon: string;
}
export interface UnavailableEntry {
  name: string;
  kind: 'missing-monster-json' | 'missing-image-path' | 'missing-image-file';
  status?: number;
}
export interface ImageDigest {
  size: number;
  sha256: string;
}
export interface EnemyAssetManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  source: 'static.nanoka.cc';
  version: string;
  generatedAt: string;
  resourceType: 'MonsterMiddleIcon';
  catalogFingerprint: string;
  monsters: Record<string, EnemyAssetEntry>;
  unavailable: Record<string, UnavailableEntry>;
  images: Record<string, ImageDigest>;
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
  if (
    !m ||
    m.schemaVersion !== SCHEMA_VERSION ||
    m.source !== 'static.nanoka.cc' ||
    typeof m.version !== 'string' ||
    !m.version.trim() ||
    typeof m.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(m.generatedAt)) ||
    m.resourceType !== 'MonsterMiddleIcon' ||
    typeof m.catalogFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(m.catalogFingerprint) ||
    !record(m.monsters) ||
    !record(m.unavailable) ||
    !record(m.images)
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
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      !numericId(entry.imageId) ||
      entry.icon !== `/generated-enemy-assets/icons/Monster_${entry.imageId}.webp`
    )
      fail(`无效 mapping 或非 canonical URL：${id}`);
    images.add(entry.imageId);
  }
  for (const [id, entry] of unavailable) {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      !['missing-monster-json', 'missing-image-path', 'missing-image-file'].includes(entry.kind) ||
      (entry.status !== undefined && (!Number.isInteger(entry.status) || entry.status !== 404))
    )
      fail(`无效 unavailable 条目：${id}`);
  }
  for (const id of SANITY_CHECK_IDS)
    if (required.has(id) && !(id in manifest.monsters)) fail(`sanity-check enemy 缺失：${id}`);
  const metadataIds = Object.keys(manifest.images);
  if (metadataIds.length !== images.size || metadataIds.some((id) => !images.has(id)))
    fail('images metadata 与映射不一致');
  const iconRoot = path.join(root, 'icons');
  let entries;
  try {
    entries = await readdir(iconRoot, { withFileTypes: true });
  } catch {
    return fail('icons 目录缺失');
  }
  const expectedNames = new Set([...images].map((id) => `Monster_${id}.webp`));
  if (
    entries.length !== expectedNames.size ||
    entries.some((entry) => !entry.isFile() || !expectedNames.has(entry.name))
  )
    fail('icons 文件集合或文件名大小写不匹配');
  let bytes = 0;
  for (const id of [...images].sort((a, b) => a.localeCompare(b))) {
    const declared = record(manifest.images[id]);
    if (
      !declared ||
      !Number.isSafeInteger(declared.size) ||
      (declared.size as number) <= 0 ||
      typeof declared.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(declared.sha256)
    )
      fail(`图片 metadata 无效：${id}`);
    let actual: ImageDigest;
    try {
      actual = await inspectWebp(path.join(iconRoot, `Monster_${id}.webp`));
    } catch (error) {
      return fail(`图片 ${id} 无效：${(error as Error).message}`);
    }
    if (declared!.size !== actual.size || declared!.sha256 !== actual.sha256)
      fail(`图片 ${id} size/sha256 不匹配`);
    bytes += actual.size;
  }
  return {
    manifest,
    mapped: mapped.length,
    unavailable: unavailable.length,
    images: images.size,
    bytes
  };
}
