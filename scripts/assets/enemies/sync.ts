import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertInsideSite } from '../../data/paths.js';
import { createCurlFetch } from './curl.js';
import {
  DEFAULT_CONCURRENCY,
  HttpError,
  fetchNanokaVersion,
  fetchWithRetry,
  mapConcurrent,
  parseNanokaMonster,
  type RetryOptions
} from './network.js';
import {
  SCHEMA_VERSION,
  catalogFingerprint,
  enemyAssetRoot,
  inspectWebp,
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
  id: string,
  old?: EnemyAssetManifest
): Promise<ImageDigest | undefined> {
  if (!old?.images[id]) return undefined;
  try {
    const image = await inspectWebp(path.join(root, 'icons', `Monster_${id}.webp`));
    const expected = old.images[id];
    return image.size === expected.size && image.sha256 === expected.sha256 ? image : undefined;
  } catch {
    return undefined;
  }
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
  const current = await oldManifest(root);
  if (!current) {
    if (backups.length !== 1) throw new Error('Multiple enemy backups require manual recovery');
    await rename(path.join(parent, backups[0]), root);
    return;
  }
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
      const previous = old?.monsters[requirement.id];
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
        monster = parseNanokaMonster(raw, requirement, endpoint, baseUrl);
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
          imageId: monster.imageId,
          icon: `/generated-enemy-assets/icons/Monster_${monster.imageId}.webp`
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
    await mkdir(path.join(stage, 'icons'), { recursive: true });
    let downloads = 0;
    let reused = 0;
    const repaired: string[] = [];
    const added: string[] = [];
    const results = await mapConcurrent(
      ids,
      options.concurrency ?? DEFAULT_CONCURRENCY,
      async (id) => {
        const target = path.join(stage, 'icons', `Monster_${id}.webp`);
        const prior = await validOldImage(root, id, old);
        if (prior) {
          await copyFile(path.join(root, 'icons', `Monster_${id}.webp`), target);
          reused += 1;
          return [id, prior] as const;
        }
        downloads += 1;
        const url = `${baseUrl}/assets/hsr/monstermiddleicon/Monster_${id}.webp`;
        try {
          const response = await fetchWithRetry(url, retry);
          if (response.status === 404) return [id, undefined] as const;
          if (!response.ok) throw new HttpError(`HTTP ${response.status}`, url, response.status);
          const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          if (
            type &&
            !['image/webp', 'application/octet-stream', 'binary/octet-stream'].includes(type)
          )
            throw new Error(`Unexpected image content-type: ${type}`);
          await writeFile(target, new Uint8Array(await response.arrayBuffer()));
          const digest = await inspectWebp(target);
          (old?.images[id] ? repaired : added).push(id);
          return [id, digest] as const;
        } catch (error) {
          return operational(error, url);
        }
      }
    );
    const missing = new Set(results.filter(([, digest]) => !digest).map(([id]) => id));
    for (const [id, entry] of Object.entries(candidates)) {
      if (!missing.has(entry.imageId)) continue;
      delete candidates[id];
      unavailable[id] = { name: entry.name, kind: 'missing-image-file', status: 404 };
    }
    const images = sorted(
      results.filter((entry): entry is readonly [string, ImageDigest] => !!entry[1])
    );
    const monsters = sorted(Object.entries(candidates));
    const missingEntries = sorted(Object.entries(unavailable));
    const manifest: EnemyAssetManifest = {
      schemaVersion: SCHEMA_VERSION,
      source: 'static.nanoka.cc',
      version,
      generatedAt: (options.now ?? (() => new Date()))().toISOString(),
      resourceType: 'MonsterMiddleIcon',
      catalogFingerprint: catalogFingerprint(requirements),
      monsters,
      unavailable: missingEntries,
      images
    };
    await writeFile(
      path.join(stage, 'README.md'),
      await readFile(path.join(root, 'README.md'), 'utf8')
    );
    await writeFile(path.join(stage, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await validateSnapshot(requirements, stage);
    const changed = !oldValid || !old || semantic(manifest) !== semantic(old);
    const stats: UpdateStats = {
      catalog: requirements.length,
      mapped: Object.keys(monsters).length,
      unavailable: Object.keys(missingEntries).length,
      images: Object.keys(images).length,
      detailRequests,
      imageDownloads: downloads,
      reusedImages: reused,
      repairedImages: repaired.sort(),
      newImages: added.sort(),
      prunedImages: Object.keys(old?.images ?? {})
        .filter((id) => !(id in images))
        .sort(),
      newTemplateIds: requirements.filter(({ id }) => !oldIds.has(id)).map(({ id }) => id),
      changedMappings: Object.entries(monsters)
        .filter(([id, entry]) => old?.monsters[id] && old.monsters[id].imageId !== entry.imageId)
        .map(([id]) => id),
      byteDelta:
        Object.values(images).reduce((sum, item) => sum + item.size, 0) -
        Object.values(old?.images ?? {}).reduce((sum, item) => sum + item.size, 0),
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
