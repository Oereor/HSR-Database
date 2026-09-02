import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { CatalogEntry } from '../../../src/lib/domain/types.js';
import { assertInsideSite, generatedRoot, siteRoot } from '../../data/paths.js';

export const NANOKA_BASE_URL = 'https://static.nanoka.cc';
export const ENEMY_ASSET_SCHEMA_VERSION = 2 as const;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RETRIES = 3;

export const enemyAssetRoot = path.join(siteRoot, 'static', 'generated-enemy-assets');
export const enemyIconRoot = path.join(enemyAssetRoot, 'icons');
export const enemyAssetManifestPath = path.join(enemyAssetRoot, 'index.json');
export const enemyAssetReadmePath = path.join(enemyAssetRoot, 'README.md');
export const enemyCatalogPath = path.join(generatedRoot, 'catalogs', 'enemies.json');

export const SANITY_CHECK_IDS = ['4064012', '1004014', '1004026', '4034013'] as const;

sharp.cache(false);

export interface EnemyRequirement {
  id: string;
  name: string;
}

export interface NanokaMonster {
  id: string;
  name: string;
  imageId: string;
  imagePath: string;
  detailUrl: string;
  iconUrl: string;
}

export interface EnemyAssetEntry {
  name: string;
  imageId: string;
  icon: string;
}

export interface EnemyAssetUnavailableEntry {
  name: string;
  kind: 'missing-monster-json' | 'missing-image-path' | 'missing-image-file';
  status?: number;
}

export interface EnemyAssetManifest {
  schemaVersion: typeof ENEMY_ASSET_SCHEMA_VERSION;
  source: 'static.nanoka.cc';
  version: string;
  generatedAt: string;
  resourceType: 'MonsterMiddleIcon';
  monsters: Record<string, EnemyAssetEntry>;
  unavailable: Record<string, EnemyAssetUnavailableEntry>;
}

export type FailureKind =
  | 'missing-monster-json'
  | 'failed-monster-json'
  | 'invalid-monster-json'
  | 'missing-image-path'
  | 'missing-image-file'
  | 'failed-image-download';

export interface EnemyAssetFailure {
  monsterTemplateId: string;
  name: string;
  endpoint: string;
  kind: FailureKind;
  status?: number;
  reason: string;
}

export interface ImageMetadata {
  width: number;
  height: number;
  size: number;
}

export interface EnemyAssetCacheValidation {
  valid: boolean;
  reason?: string;
  mappedMonsterTemplateIds: number;
  unavailableMonsterTemplateIds: number;
  uniqueImageIds: number;
}

export type IconWriteResult =
  | { disposition: 'created' | 'replaced'; metadata: ImageMetadata }
  | { disposition: 'skipped'; metadata: ImageMetadata };

export interface RetryOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const objectRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function isToleratedEnemyAssetFailure(failure: EnemyAssetFailure): boolean {
  return ['missing-monster-json', 'missing-image-path', 'missing-image-file'].includes(
    failure.kind
  );
}

export function parseEnemyAssetManifest(value: unknown): EnemyAssetManifest | undefined {
  const manifest = objectRecord(value);
  if (
    manifest?.schemaVersion !== ENEMY_ASSET_SCHEMA_VERSION ||
    manifest.source !== 'static.nanoka.cc' ||
    typeof manifest.version !== 'string' ||
    !manifest.version.trim() ||
    typeof manifest.generatedAt !== 'string' ||
    manifest.resourceType !== 'MonsterMiddleIcon' ||
    !objectRecord(manifest.monsters) ||
    !objectRecord(manifest.unavailable)
  ) {
    return undefined;
  }
  return manifest as unknown as EnemyAssetManifest;
}

export async function readEnemyAssetManifest(
  manifestFile = enemyAssetManifestPath
): Promise<EnemyAssetManifest | undefined> {
  try {
    return parseEnemyAssetManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
  } catch {
    return undefined;
  }
}

const decimalId = (value: unknown): string | undefined => {
  const normalized = typeof value === 'number' ? String(value) : value;
  return typeof normalized === 'string' && /^\d+$/.test(normalized) ? normalized : undefined;
};

export function assertEnemyAssetPath(target: string): string {
  assertInsideSite(target);
  const resolved = path.resolve(target);
  const root = path.resolve(enemyAssetRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`拒绝操作敌人资源目录之外的路径：${resolved}`);
  }
  return resolved;
}

export async function readEnemyRequirements(
  catalogFile = enemyCatalogPath
): Promise<EnemyRequirement[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(catalogFile, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取敌人目录 ${catalogFile}；请先运行 pnpm data:ensure。`, {
      cause: error
    });
  }
  if (!Array.isArray(parsed)) throw new Error(`敌人目录不是数组：${catalogFile}`);
  const requirements = parsed.map((value, index) => {
    const entry = objectRecord(value) as (CatalogEntry & Record<string, unknown>) | undefined;
    const id = decimalId(entry?.id);
    const name = entry?.name;
    if (!id || typeof name !== 'string' || !name.trim()) {
      throw new Error(`敌人目录第 ${index + 1} 项缺少合法 id/name。`);
    }
    return { id, name: name.trim() };
  });
  const seen = new Set<string>();
  for (const requirement of requirements) {
    if (seen.has(requirement.id)) throw new Error(`敌人目录包含重复 ID：${requirement.id}`);
    seen.add(requirement.id);
  }
  return requirements.sort((left, right) => left.id.localeCompare(right.id));
}

export function extractImageId(imagePath: unknown): string | undefined {
  return typeof imagePath === 'string' ? imagePath.match(/\d+/)?.[0] : undefined;
}

export function parseNanokaMonster(
  value: unknown,
  requirement: EnemyRequirement,
  detailUrl: string,
  baseUrl = NANOKA_BASE_URL
): NanokaMonster {
  const record = objectRecord(value);
  if (!record) throw new Error('monster JSON 不是对象。');
  const id = decimalId(record.id);
  if (!id) throw new Error('monster JSON 缺少合法 id。');
  if (id !== requirement.id) {
    throw new Error(`monster JSON id 不匹配：期望 ${requirement.id}，实际 ${id}。`);
  }
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) throw new Error('monster JSON 缺少 name。');
  const imagePath = typeof record.image_path === 'string' ? record.image_path : '';
  const imageId = extractImageId(imagePath);
  if (!imageId) throw new Error('monster JSON 缺少可解析的 image_path。');
  return {
    id,
    name,
    imageId,
    imagePath,
    detailUrl,
    iconUrl: `${baseUrl}/assets/hsr/monstermiddleicon/Monster_${imageId}.webp`
  };
}

function retryAfterMilliseconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - Date.now(), 0), 30_000);
}

const retryableStatus = (status: number): boolean => status === 429 || status >= 500;

export async function fetchWithRetry(url: string, options: RetryOptions = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const wait = options.sleep ?? sleep;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'HSR-Database enemy asset sync' }
      });
      if (!retryableStatus(response.status) || attempt === maxRetries) return response;
      const delay = retryAfterMilliseconds(response) ?? 1000 * 2 ** attempt;
      await response.body?.cancel().catch(() => undefined);
      await wait(delay);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`请求失败：${url}：${message}`, { cause: error });
      }
      await wait(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`请求失败：${url}`);
}

export async function fetchJson(url: string, options: RetryOptions = {}): Promise<unknown> {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) throw new HttpError(`HTTP ${response.status}：${url}`, url, response.status);
  const text = await response.text();
  if (!text.trim()) throw new Error(`JSON 响应为空：${url}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 响应无法解析：${url}`, { cause: error });
  }
}

export function resolveNanokaVersion(value: unknown): string {
  const manifest = objectRecord(value);
  const hsr = objectRecord(manifest?.hsr);
  const latest = hsr?.latest;
  if (typeof latest !== 'string' || !latest.trim()) {
    throw new Error('Nanoka manifest 缺少 hsr.latest。');
  }
  return latest.trim();
}

export async function fetchNanokaVersion(
  baseUrl = NANOKA_BASE_URL,
  options: RetryOptions = {}
): Promise<string> {
  return resolveNanokaVersion(
    await fetchJson(`${baseUrl.replace(/\/$/, '')}/manifest.json`, options)
  );
}

export async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('并发数必须为正整数。');
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readWebpHeader(file: string): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function hasWebpSignature(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 12 &&
    Buffer.from(buffer.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(buffer.subarray(8, 12)).toString('ascii') === 'WEBP'
  );
}

export async function validateWebpFile(file: string): Promise<ImageMetadata> {
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size <= 0) throw new Error('文件为空或不是普通文件。');
  if (!hasWebpSignature(await readWebpHeader(file))) throw new Error('缺少 WebP 文件签名。');
  const image = await sharp(file).metadata();
  if (image.format !== 'webp' || !image.width || !image.height) {
    throw new Error('Sharp 无法确认有效的 WebP 尺寸。');
  }
  return { width: image.width, height: image.height, size: metadata.size };
}

const invalidCache = (
  reason: string,
  mappedMonsterTemplateIds = 0,
  unavailableMonsterTemplateIds = 0,
  uniqueImageIds = 0
): EnemyAssetCacheValidation => ({
  valid: false,
  reason,
  mappedMonsterTemplateIds,
  unavailableMonsterTemplateIds,
  uniqueImageIds
});

export async function validateEnemyAssetCache(
  requirements: readonly EnemyRequirement[],
  manifest: EnemyAssetManifest | undefined,
  iconRoot = enemyIconRoot
): Promise<EnemyAssetCacheValidation> {
  if (!manifest) return invalidCache('manifest 缺失、损坏或 schema 不是 2');
  const monsterEntries = Object.entries(manifest.monsters);
  const unavailableEntries = Object.entries(manifest.unavailable);
  const mapped = monsterEntries.length;
  const unavailable = unavailableEntries.length;
  const requiredIds = new Set(requirements.map((requirement) => requirement.id));
  const coveredIds = new Set([...monsterEntries, ...unavailableEntries].map(([id]) => id));
  if (coveredIds.size !== mapped + unavailable) {
    return invalidCache('monsters 与 unavailable 存在重复 ID', mapped, unavailable);
  }
  if (
    coveredIds.size !== requiredIds.size ||
    [...requiredIds].some((id) => !coveredIds.has(id)) ||
    [...coveredIds].some((id) => !requiredIds.has(id))
  ) {
    return invalidCache('manifest 未精确覆盖当前 enemy catalog', mapped, unavailable);
  }
  if (requirements.length > 0 && mapped === 0) {
    return invalidCache('enemy catalog 非空但没有任何可用映射', mapped, unavailable);
  }
  const allowedMissingKinds = new Set([
    'missing-monster-json',
    'missing-image-path',
    'missing-image-file'
  ]);
  for (const [id, entry] of unavailableEntries) {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      !allowedMissingKinds.has(entry.kind)
    ) {
      return invalidCache(`unavailable 条目无效：${id}`, mapped, unavailable);
    }
  }
  let actualNames: Set<string>;
  try {
    actualNames = new Set(
      (await readdir(iconRoot, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    );
  } catch {
    return invalidCache('enemy icon 目录缺失', mapped, unavailable);
  }
  const uniqueImageIds = new Set<string>();
  for (const [id, entry] of monsterEntries) {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      typeof entry.imageId !== 'string' ||
      !/^\d+$/.test(entry.imageId)
    ) {
      return invalidCache(`monster 条目无效：${id}`, mapped, unavailable, uniqueImageIds.size);
    }
    const filename = `Monster_${entry.imageId}.webp`;
    const canonicalUrl = `/generated-enemy-assets/icons/${filename}`;
    if (entry.icon !== canonicalUrl || !actualNames.has(filename)) {
      return invalidCache(
        `enemy icon 路径或文件名大小写不匹配：${id}`,
        mapped,
        unavailable,
        uniqueImageIds.size
      );
    }
    uniqueImageIds.add(entry.imageId);
  }
  if (requirements.length > 0 && uniqueImageIds.size === 0) {
    return invalidCache('enemy catalog 非空但没有任何有效图片', mapped, unavailable);
  }
  const imageErrors = await mapConcurrent(
    [...uniqueImageIds],
    DEFAULT_CONCURRENCY,
    async (imageId) => {
      try {
        await validateWebpFile(path.join(iconRoot, `Monster_${imageId}.webp`));
        return undefined;
      } catch (error) {
        return `enemy icon 无效：Monster_${imageId}.webp：${(error as Error).message}`;
      }
    }
  );
  const imageError = imageErrors.find((error) => error !== undefined);
  if (imageError) {
    return invalidCache(imageError, mapped, unavailable, uniqueImageIds.size);
  }
  for (const id of SANITY_CHECK_IDS) {
    if (requiredIds.has(id) && !manifest.monsters[id]) {
      return invalidCache(
        `sanity-check enemy 缺失：${id}`,
        mapped,
        unavailable,
        uniqueImageIds.size
      );
    }
  }
  return {
    valid: true,
    mappedMonsterTemplateIds: mapped,
    unavailableMonsterTemplateIds: unavailable,
    uniqueImageIds: uniqueImageIds.size
  };
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function renameAfterUnlock(source: string, target: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EBUSY', 'EPERM'].includes(code ?? '') || attempt === 5) throw error;
      await sleep(50 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function replaceWithRename(temporary: string, target: string): Promise<void> {
  try {
    await renameAfterUnlock(temporary, target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'EPERM') throw error;
    if (!(await pathExists(target))) throw error;
    const backup = `${target}.previous-${randomUUID()}`;
    await renameAfterUnlock(target, backup);
    try {
      await renameAfterUnlock(temporary, target);
      await rm(backup, { force: true });
    } catch (replacementError) {
      await renameAfterUnlock(backup, target).catch(() => undefined);
      throw replacementError;
    }
  }
}

export async function writeFileAtomically(
  target: string,
  contents: string | Uint8Array
): Promise<void> {
  assertEnemyAssetPath(target);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.tmp-${randomUUID()}`
  );
  assertEnemyAssetPath(temporary);
  try {
    await writeFile(temporary, contents);
    await replaceWithRename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function ensureEnemyIcon(
  monster: NanokaMonster,
  options: RetryOptions & { force?: boolean; iconRoot?: string } = {}
): Promise<IconWriteResult> {
  const iconRoot = options.iconRoot ?? enemyIconRoot;
  const target = path.join(iconRoot, `Monster_${monster.imageId}.webp`);
  assertEnemyAssetPath(target);
  const existed = await pathExists(target);
  if (!options.force && existed) {
    try {
      return { disposition: 'skipped', metadata: await validateWebpFile(target) };
    } catch {
      // Invalid cached files are replaced by the normal download path.
    }
  }
  const response = await fetchWithRetry(monster.iconUrl, options);
  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status}`, monster.iconUrl, response.status);
  }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (
    contentType &&
    !['image/webp', 'application/octet-stream', 'binary/octet-stream'].includes(contentType)
  ) {
    throw new Error(`响应 Content-Type 不是 WebP：${contentType}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error('图片响应为空。');
  if (!hasWebpSignature(bytes)) throw new Error('图片响应缺少 WebP 文件签名。');
  await mkdir(iconRoot, { recursive: true });
  const temporary = path.join(iconRoot, `.Monster_${monster.imageId}.tmp-${randomUUID()}.webp`);
  assertEnemyAssetPath(temporary);
  try {
    await writeFile(temporary, bytes);
    const metadata = await validateWebpFile(temporary);
    await replaceWithRename(temporary, target);
    return { disposition: existed ? 'replaced' : 'created', metadata };
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function pruneEnemyIcons(
  referencedImageIds: ReadonlySet<string>,
  iconRoot = enemyIconRoot
): Promise<number> {
  assertEnemyAssetPath(iconRoot);
  let entries;
  try {
    entries = await readdir(iconRoot, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    const match = entry.isFile() ? /^Monster_(\d+)\.webp$/.exec(entry.name) : undefined;
    if (!match || referencedImageIds.has(match[1])) continue;
    const target = path.join(iconRoot, entry.name);
    assertEnemyAssetPath(target);
    await rm(target, { force: true });
    removed += 1;
  }
  return removed;
}

export async function cleanEnemyTemporaryFiles(iconRoot = enemyIconRoot): Promise<number> {
  assertEnemyAssetPath(iconRoot);
  let entries;
  try {
    entries = await readdir(iconRoot, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^\.Monster_\d+\.tmp-[\w-]+\.webp$/.test(entry.name)) continue;
    const target = path.join(iconRoot, entry.name);
    assertEnemyAssetPath(target);
    await rm(target, { force: true, maxRetries: 5, retryDelay: 100 });
    removed += 1;
  }
  return removed;
}

export async function directoryFileSize(directory: string): Promise<number> {
  assertEnemyAssetPath(directory);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  const sizes = await Promise.all(
    entries.filter((entry) => entry.isFile()).map((entry) => stat(path.join(directory, entry.name)))
  );
  return sizes.reduce((total, metadata) => total + metadata.size, 0);
}

export const provenanceReadme = `# Generated enemy assets

- Upstream source: static.nanoka.cc
- Resource type: MonsterMiddleIcon
- Images and index.json are generated by the enemy asset sync script.
- Do not edit the mapping by hand.
- Update with: pnpm assets:sync:enemies
- If Node cannot inherit a required HTTPS proxy, set HTTPS_PROXY and append: -- --curl

No upstream license is asserted by this file.
`;
