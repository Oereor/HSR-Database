import { randomUUID } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  ENEMY_ASSET_SCHEMA_VERSION,
  ENEMY_IMAGE_DIRECTORIES,
  ENEMY_IMAGE_TYPES,
  enemyImageFileName,
  type EnemyImageType
} from '../../../src/lib/domain/enemy-asset-paths.js';
import { assertInsideSite } from '../../data/paths.js';
import { createCurlFetch } from './curl.js';
import {
  DEFAULT_CONCURRENCY,
  HttpError,
  fetchNanokaVersion,
  fetchWithRetry,
  mapConcurrent,
  nanokaImageUrl,
  parseNanokaMonster,
  type RetryOptions
} from './network.js';
import {
  catalogFingerprint,
  enemyAssetRoot,
  inspectWebp,
  isEnemyAssetEntry,
  parseManifest,
  readEnemyRequirements,
  validateSnapshot,
  type EnemyAssetEntry,
  type EnemyAssetManifest,
  type EnemyRequirement,
  type ImageDigest,
  type UnavailableEntry
} from './snapshot.js';

const BASE_URL = 'https://static.nanoka.cc';
const MAX_FIGURE_EDGE = 1280;
const PROXY_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy'
];
const sorted = <T>(entries: Iterable<readonly [string, T]>): Record<string, T> =>
  Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));

export interface UpdateStats {
  catalog: number;
  mapped: number;
  unavailable: number;
  images: number;
  detailRequests: number;
  imageDownloads: number;
  downloadedSourceBytes: number;
  downloadedOutputBytes: number;
  reusedImages: number;
  repairedImages: string[];
  newImages: string[];
  prunedImages: string[];
  newTemplateIds: string[];
  changedMappings: string[];
  byteDelta: number;
  changed: boolean;
  wallSeconds: number;
}
export interface UpdateResult {
  observedVersion: string;
  stats: UpdateStats;
}
export interface UpdateOptions extends RetryOptions {
  assetRoot?: string;
  catalogFile?: string;
  baseUrl?: string;
  concurrency?: number;
  force?: boolean;
  now?: () => Date;
  log?: (value: string) => void;
}

function semantic(manifest: EnemyAssetManifest): string {
  return JSON.stringify({
    catalogFingerprint: manifest.catalogFingerprint,
    monsters: manifest.monsters,
    unavailable: manifest.unavailable,
    images: manifest.images
  });
}

async function oldManifest(root: string): Promise<EnemyAssetManifest | undefined> {
  try {
    return parseManifest(JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

async function validOldImage(
  root: string,
  type: EnemyImageType,
  id: string,
  old?: EnemyAssetManifest
): Promise<ImageDigest | undefined> {
  const expected = old?.images[type][id];
  if (!expected) return undefined;
  try {
    const image = await inspectWebp(imagePath(root, type, id));
    return image.size === expected.size && image.sha256 === expected.sha256 ? image : undefined;
  } catch {
    return undefined;
  }
}

function imagePath(root: string, type: EnemyImageType, id: string): string {
  return path.join(root, ENEMY_IMAGE_DIRECTORIES[type], enemyImageFileName(id));
}

async function optimizeFigure(original: Buffer): Promise<Buffer> {
  const image = sharp(original, { animated: true });
  const { format, width, height, pageHeight } = await image.metadata();
  if (format !== 'webp' || !width || !height) throw new Error('下载内容不是有效 WebP');
  const optimized = await image
    .resize(MAX_FIGURE_EDGE, MAX_FIGURE_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const needsResize = Math.max(width, pageHeight ?? height) > MAX_FIGURE_EDGE;
  return needsResize || optimized.length <= original.length * 0.95 ? optimized : original;
}

function operational(error: unknown, endpoint: string): never {
  throw new Error(`enemy update operational failure (${endpoint}): ${(error as Error).message}`, {
    cause: error
  });
}

async function recoverBackup(root: string): Promise<void> {
  const parent = path.dirname(root);
  const backups = (await readdir(parent)).filter((name) =>
    name.startsWith(`.${path.basename(root)}.previous-`)
  );
  if (!backups.length) return;
  try {
    await access(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (backups.length !== 1)
      throw new Error('Multiple enemy backups require manual recovery', { cause: error });
    await rename(path.join(parent, backups[0]), root);
    return;
  }
  if (!(await oldManifest(root))) return;
  await validateSnapshot(await readEnemyRequirements(), root);
  for (const backup of backups) await rm(path.join(parent, backup), { recursive: true });
}

async function publish(stage: string, root: string): Promise<void> {
  const backup = path.join(path.dirname(root), `.${path.basename(root)}.previous-${randomUUID()}`);
  let hadOld = false;
  try {
    await rename(root, backup);
    hadOld = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await rename(stage, root);
  } catch (error) {
    if (hadOld) {
      try {
        await rename(backup, root);
      } catch (rollback) {
        throw new AggregateError([error, rollback], `Original snapshot remains at ${backup}`, {
          cause: rollback
        });
      }
    }
    throw error;
  }
  if (hadOld) {
    try {
      await rm(backup, { recursive: true });
    } catch (error) {
      console.warn(`Enemy backup cleanup deferred: ${(error as Error).message}`);
    }
  }
}

export async function updateEnemyAssets(options: UpdateOptions = {}): Promise<UpdateResult> {
  const started = performance.now();
  const root = path.resolve(options.assetRoot ?? enemyAssetRoot);
  assertInsideSite(root);
  if (root === path.resolve(path.dirname(enemyAssetRoot)))
    throw new Error('Refusing broad enemy update target');
  if (!options.assetRoot) await recoverBackup(root);
  const requirements = await readEnemyRequirements(options.catalogFile);
  const old = await oldManifest(root);
  let oldValid = false;
  if (old) {
    try {
      await validateSnapshot(requirements, root);
      oldValid = true;
    } catch {
      /* A damaged snapshot may be repaired by the explicit updater. */
    }
  }
  const oldIds = new Set([
    ...Object.keys(old?.monsters ?? {}),
    ...Object.keys(old?.unavailable ?? {})
  ]);
  const baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/$/, '');
  const retry: RetryOptions = {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.sleep ? { sleep: options.sleep } : {})
  };
  const version = await fetchNanokaVersion(baseUrl, retry);
  const refreshAll = options.force || old?.version !== version;
  let detailRequests = 0;
  const details = await mapConcurrent(
    requirements,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    async (
      requirement
    ): Promise<{
      requirement: EnemyRequirement;
      entry?: EnemyAssetEntry;
      unavailable?: UnavailableEntry;
    }> => {
      const cached = old?.monsters[requirement.id];
      const previous = isEnemyAssetEntry(cached) ? cached : undefined;
      if (!refreshAll && previous) return { requirement, entry: previous };
      const endpoint = `${baseUrl}/hsr/${encodeURIComponent(version)}/zh/monster/${requirement.id}.json`;
      detailRequests += 1;
      let raw: unknown;
      try {
        const response = await fetchWithRetry(endpoint, retry);
        if (response.status === 404)
          return {
            requirement,
            unavailable: { name: requirement.name, kind: 'missing-monster-json', status: 404 }
          };
        if (!response.ok) throw new HttpError(`HTTP ${response.status}`, endpoint, response.status);
        raw = JSON.parse(await response.text());
      } catch (error) {
        return operational(error, endpoint);
      }
      let monster;
      try {
        monster = parseNanokaMonster(raw, requirement);
      } catch (error) {
        if (error instanceof Error && /缺少可解析的 image_path/.test(error.message))
          return {
            requirement,
            unavailable: { name: requirement.name, kind: 'missing-image-path' }
          };
        return operational(error, endpoint);
      }
      return {
        requirement,
        entry: {
          name: previous?.imageId === monster.imageId ? previous.name : monster.name,
          imageId: monster.imageId
        }
      };
    }
  );
  const candidates = sorted(
    details.filter((item) => item.entry).map((item) => [item.requirement.id, item.entry!] as const)
  );
  const unavailable = sorted(
    details
      .filter((item) => item.unavailable)
      .map((item) => [item.requirement.id, item.unavailable!] as const)
  );
  const ids = [...new Set(Object.values(candidates).map((entry) => entry.imageId))].sort((a, b) =>
    a.localeCompare(b)
  );
  const stage = path.join(path.dirname(root), `.${path.basename(root)}.staging-${randomUUID()}`);
  assertInsideSite(stage);
  let published = false;
  try {
    for (const type of ENEMY_IMAGE_TYPES)
      await mkdir(path.join(stage, ENEMY_IMAGE_DIRECTORIES[type]), { recursive: true });
    let downloads = 0;
    let downloadedSourceBytes = 0;
    let downloadedOutputBytes = 0;
    let reused = 0;
    const repaired: string[] = [];
    const added: string[] = [];
    const results = await mapConcurrent(
      ENEMY_IMAGE_TYPES.flatMap((type) => ids.map((id) => ({ type, id }))),
      options.concurrency ?? DEFAULT_CONCURRENCY,
      async ({ type, id }) => {
        const target = imagePath(stage, type, id);
        const prior = await validOldImage(root, type, id, old);
        if (prior) {
          await copyFile(imagePath(root, type, id), target);
          reused += 1;
          return { type, id, digest: prior };
        }
        downloads += 1;
        const url = nanokaImageUrl(baseUrl, type, id);
        try {
          const response = await fetchWithRetry(url, retry);
          if (response.status === 404) return { type, id, digest: null };
          if (!response.ok) throw new HttpError(`HTTP ${response.status}`, url, response.status);
          const contentType = response.headers
            .get('content-type')
            ?.split(';')[0]
            .trim()
            .toLowerCase();
          if (
            contentType &&
            !['image/webp', 'application/octet-stream', 'binary/octet-stream'].includes(contentType)
          )
            throw new Error(`Unexpected image content-type: ${contentType}`);
          const original = Buffer.from(await response.arrayBuffer());
          const output = type === 'MonsterFigure' ? await optimizeFigure(original) : original;
          await writeFile(target, output);
          const digest = await inspectWebp(target);
          downloadedSourceBytes += original.length;
          downloadedOutputBytes += digest.size;
          (old?.images[type][id] ? repaired : added).push(`${type}/${id}`);
          return { type, id, digest };
        } catch (error) {
          return operational(error, url);
        }
      }
    );
    const images: EnemyAssetManifest['images'] = { MonsterMiddleIcon: {}, MonsterFigure: {} };
    for (const { type, id, digest } of results) images[type][id] = digest;
    const manifest: EnemyAssetManifest = {
      schemaVersion: ENEMY_ASSET_SCHEMA_VERSION,
      source: 'static.nanoka.cc',
      version,
      generatedAt: (options.now ?? (() => new Date()))().toISOString(),
      catalogFingerprint: catalogFingerprint(requirements),
      monsters: candidates,
      unavailable,
      images
    };
    await writeFile(
      path.join(stage, 'README.md'),
      await readFile(path.join(root, 'README.md'), 'utf8')
    );
    await writeFile(path.join(stage, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const validated = await validateSnapshot(requirements, stage);
    const changed = !oldValid || !old || semantic(manifest) !== semantic(old);
    const stats: UpdateStats = {
      catalog: requirements.length,
      mapped: validated.mapped,
      unavailable: validated.unavailable,
      images: validated.images,
      detailRequests,
      imageDownloads: downloads,
      downloadedSourceBytes,
      downloadedOutputBytes,
      reusedImages: reused,
      repairedImages: repaired.sort(),
      newImages: added.sort(),
      prunedImages: ENEMY_IMAGE_TYPES.flatMap((type) =>
        Object.entries(old?.images[type] ?? {})
          .filter(([id, digest]) => digest && !images[type][id])
          .map(([id]) => `${type}/${id}`)
      ).sort(),
      newTemplateIds: requirements.filter(({ id }) => !oldIds.has(id)).map(({ id }) => id),
      changedMappings: Object.entries(candidates)
        .filter(([id, entry]) => old?.monsters[id] && old.monsters[id].imageId !== entry.imageId)
        .map(([id]) => id),
      byteDelta:
        validated.bytes -
        Object.values(old?.images ?? {})
          .flatMap((digests) => Object.values(digests))
          .reduce((sum, digest) => sum + (digest?.size ?? 0), 0),
      changed,
      wallSeconds: (performance.now() - started) / 1000
    };
    if (changed) {
      await publish(stage, root);
      published = true;
    }
    const log = options.log ?? console.log;
    log(
      `[enemy-update] observed-version=${version} snapshot-version=${changed ? version : old?.version} changed=${changed}`
    );
    log(
      `[enemy-update] catalog=${stats.catalog} mapped=${stats.mapped} unavailable=${stats.unavailable} images=${stats.images} details=${detailRequests} downloads=${downloads} reused=${reused} wall=${stats.wallSeconds.toFixed(3)}s`
    );
    log(
      `[enemy-update] downloaded-source-bytes=${downloadedSourceBytes} downloaded-output-bytes=${downloadedOutputBytes}`
    );
    log(
      `[enemy-update] new-ids=${stats.newTemplateIds.join(',') || '-'} changed-mappings=${stats.changedMappings.join(',') || '-'} new-images=${added.join(',') || '-'} repaired=${repaired.join(',') || '-'} pruned=${stats.prunedImages.join(',') || '-'} byte-delta=${stats.byteDelta}`
    );
    return { observedVersion: version, stats };
  } finally {
    if (!published) await rm(stage, { recursive: true, force: true });
  }
}

export async function runEnemyUpdateCli(args: string[]): Promise<void> {
  const unknown = args.filter((arg) => !['--', '--curl', '--force'].includes(arg));
  if (unknown.length) throw new Error(`Unknown enemy update arguments: ${unknown.join(', ')}`);
  const useCurl = args.includes('--curl') || PROXY_KEYS.some((key) => process.env[key]?.trim());
  const { loadDeploymentLock, prepareTurnBasedGameData, siteRoot } =
    await import('../../deployment/prepare.js');
  const { ensureData } = await import('../../data/ensure.js');
  const lock = await loadDeploymentLock();
  const checkout = await prepareTurnBasedGameData(lock);
  process.env.HSR_DATA_ROOT = path.relative(siteRoot, checkout.directory).replaceAll('\\', '/');
  await ensureData();
  const result = await updateEnemyAssets({
    force: args.includes('--force'),
    ...(useCurl ? { fetchImpl: createCurlFetch() } : {})
  });
  const report = process.env.ENEMY_UPDATE_REPORT?.trim();
  if (report) {
    assertInsideSite(path.resolve(report));
    await mkdir(path.dirname(path.resolve(report)), { recursive: true });
    await writeFile(path.resolve(report), `${JSON.stringify(result, null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runEnemyUpdateCli(process.argv.slice(2));
