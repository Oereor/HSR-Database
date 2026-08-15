import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createCurlFetch } from './curl.js';
import {
  DEFAULT_CONCURRENCY,
  ENEMY_ASSET_SCHEMA_VERSION,
  NANOKA_BASE_URL,
  SANITY_CHECK_IDS,
  cleanEnemyTemporaryFiles,
  directoryFileSize,
  enemyAssetRoot,
  enemyAssetManifestPath,
  enemyAssetReadmePath,
  enemyIconRoot,
  ensureEnemyIcon,
  fetchJson,
  HttpError,
  mapConcurrent,
  parseNanokaMonster,
  provenanceReadme,
  pruneEnemyIcons,
  readEnemyRequirements,
  validateWebpFile,
  writeFileAtomically,
  type EnemyAssetFailure,
  type EnemyAssetManifest,
  type EnemyRequirement,
  type FailureKind,
  type NanokaMonster,
  type RetryOptions
} from './shared.js';

interface DetailSuccess {
  requirement: EnemyRequirement;
  monster: NanokaMonster;
}

interface DetailFailure {
  requirement: EnemyRequirement;
  failure: EnemyAssetFailure;
}

interface IconSuccess {
  imageId: string;
  disposition: 'created' | 'replaced' | 'skipped';
  width: number;
  height: number;
}

interface IconFailure {
  imageId: string;
  error: unknown;
  endpoint: string;
}

export interface EnemyAssetSyncStats {
  totalMonsterTemplateIds: number;
  resolvedMonsterDetails: number;
  mappedMonsterTemplateIds: number;
  uniqueImageIds: number;
  newImages: number;
  replacedImages: number;
  downloadedImages: number;
  skippedImages: number;
  prunedImages: number;
  missingMonsterJson: number;
  missingImagePath: number;
  failedMonsterJson: number;
  failedImageDownloads: number;
  iconDirectoryBytes: number;
  mappingBytes: number;
}

export interface EnemyAssetSyncResult {
  version: string;
  manifest: EnemyAssetManifest;
  failures: EnemyAssetFailure[];
  stats: EnemyAssetSyncStats;
}

export interface EnemyAssetSyncOptions extends RetryOptions {
  baseUrl?: string;
  catalogFile?: string;
  concurrency?: number;
  force?: boolean;
  now?: () => Date;
  log?: (message: string) => void;
  assetRoot?: string;
}

const objectRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function resolvedVersion(value: unknown): string {
  const manifest = objectRecord(value);
  const hsr = objectRecord(manifest?.hsr);
  const latest = hsr?.latest;
  if (typeof latest !== 'string' || !latest.trim()) {
    throw new Error('Nanoka manifest 缺少 hsr.latest。');
  }
  return latest.trim();
}

function failureFromError(
  requirement: EnemyRequirement,
  endpoint: string,
  error: unknown,
  fallbackKind: FailureKind
): EnemyAssetFailure {
  const http = error instanceof HttpError ? error : undefined;
  let kind = fallbackKind;
  if (fallbackKind !== 'failed-image-download') {
    if (http?.status === 404) kind = 'missing-monster-json';
    else if (error instanceof Error && /image_path/.test(error.message))
      kind = 'missing-image-path';
    else if (!(error instanceof HttpError)) kind = 'invalid-monster-json';
  }
  return {
    monsterTemplateId: requirement.id,
    name: requirement.name,
    endpoint,
    kind,
    ...(http ? { status: http.status } : {}),
    reason: error instanceof Error ? error.message : String(error)
  };
}

const mib = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const kib = (bytes: number): string => `${(bytes / 1024).toFixed(2)} KiB`;

function printSummary(result: EnemyAssetSyncResult, log: (message: string) => void): void {
  const { stats } = result;
  log('敌人头像同步统计：');
  log(`  total MonsterTemplateIDs: ${stats.totalMonsterTemplateIds}`);
  log(`  successfully resolved: ${stats.resolvedMonsterDetails}`);
  log(`  mapped MonsterTemplateIDs: ${stats.mappedMonsterTemplateIds}`);
  log(`  unique imageIds: ${stats.uniqueImageIds}`);
  log(
    `  downloaded: ${stats.downloadedImages}（新增 ${stats.newImages}，替换 ${stats.replacedImages}）`
  );
  log(`  reused/skipped: ${stats.skippedImages}`);
  log(`  pruned: ${stats.prunedImages}`);
  log(`  missing monster JSON: ${stats.missingMonsterJson}`);
  log(`  missing image_path: ${stats.missingImagePath}`);
  log(`  failed monster JSON: ${stats.failedMonsterJson}`);
  log(`  failed image download: ${stats.failedImageDownloads}`);
  log(`  image directory size: ${mib(stats.iconDirectoryBytes)}`);
  log(`  mapping JSON size: ${kib(stats.mappingBytes)}`);
}

async function printSanityChecks(
  result: EnemyAssetSyncResult,
  log: (message: string) => void,
  iconRoot = enemyIconRoot
): Promise<void> {
  log('Sanity checks：');
  for (const id of SANITY_CHECK_IDS) {
    const entry = result.manifest.monsters[id];
    if (!entry) {
      const failure = result.failures.find((item) => item.monsterTemplateId === id);
      log(`  ${id}: 失败 — ${failure?.reason ?? '未进入 mapping'}`);
      continue;
    }
    const localPath = path.join(iconRoot, `Monster_${entry.imageId}.webp`);
    const metadata = await validateWebpFile(localPath);
    log(
      `  ${id}\t${entry.name}\timageId=${entry.imageId}\t${localPath}\t${metadata.width}x${metadata.height}`
    );
  }
}

export async function syncEnemyAssets(
  options: EnemyAssetSyncOptions = {}
): Promise<EnemyAssetSyncResult> {
  const baseUrl = (options.baseUrl ?? NANOKA_BASE_URL).replace(/\/$/, '');
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console.log;
  const assetRoot = options.assetRoot ?? enemyAssetRoot;
  const iconRoot = path.join(assetRoot, 'icons');
  const manifestPath =
    options.assetRoot === undefined ? enemyAssetManifestPath : path.join(assetRoot, 'index.json');
  const readmePath =
    options.assetRoot === undefined ? enemyAssetReadmePath : path.join(assetRoot, 'README.md');
  const retryOptions: RetryOptions = {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
    ...(options.sleep ? { sleep: options.sleep } : {})
  };

  const requirements = await readEnemyRequirements(options.catalogFile);
  await writeFileAtomically(readmePath, provenanceReadme);
  const cleanedTemporaryFiles = await cleanEnemyTemporaryFiles(iconRoot);
  if (cleanedTemporaryFiles) log(`已清理遗留临时 WebP：${cleanedTemporaryFiles}`);

  const manifestUrl = `${baseUrl}/manifest.json`;
  const version = resolvedVersion(await fetchJson(manifestUrl, retryOptions));
  log(`Nanoka HSR version: ${version}`);
  const monsterIndexUrl = `${baseUrl}/hsr/${encodeURIComponent(version)}/monster.json`;
  const monsterIndex = await fetchJson(monsterIndexUrl, retryOptions);
  if (monsterIndex === null || (typeof monsterIndex !== 'object' && !Array.isArray(monsterIndex))) {
    throw new Error(`Nanoka monster index 格式异常：${monsterIndexUrl}`);
  }
  log(`已确认 Nanoka monster index：${monsterIndexUrl}`);

  const detailResults = await mapConcurrent(requirements, concurrency, async (requirement) => {
    const endpoint = `${baseUrl}/hsr/${encodeURIComponent(version)}/zh/monster/${requirement.id}.json`;
    try {
      const raw = await fetchJson(endpoint, retryOptions);
      return {
        requirement,
        monster: parseNanokaMonster(raw, requirement, endpoint, baseUrl)
      } satisfies DetailSuccess;
    } catch (error) {
      return {
        requirement,
        failure: failureFromError(requirement, endpoint, error, 'failed-monster-json')
      } satisfies DetailFailure;
    }
  });
  const detailSuccesses = detailResults.filter(
    (result): result is DetailSuccess => 'monster' in result
  );
  const failures = detailResults
    .filter((result): result is DetailFailure => 'failure' in result)
    .map((result) => result.failure);

  const monstersByImage = new Map<string, DetailSuccess[]>();
  for (const success of detailSuccesses) {
    const current = monstersByImage.get(success.monster.imageId) ?? [];
    current.push(success);
    monstersByImage.set(success.monster.imageId, current);
  }
  const uniqueImages = [...monstersByImage.values()].map((values) => values[0].monster);
  const iconResults = await mapConcurrent(uniqueImages, concurrency, async (monster) => {
    try {
      const written = await ensureEnemyIcon(monster, {
        ...retryOptions,
        force: options.force,
        iconRoot
      });
      return {
        imageId: monster.imageId,
        disposition: written.disposition,
        width: written.metadata.width,
        height: written.metadata.height
      } satisfies IconSuccess;
    } catch (error) {
      return {
        imageId: monster.imageId,
        error,
        endpoint: monster.iconUrl
      } satisfies IconFailure;
    }
  });

  const successfulImageIds = new Set(
    iconResults
      .filter((result): result is IconSuccess => 'disposition' in result)
      .map((r) => r.imageId)
  );
  const iconFailures = iconResults.filter((result): result is IconFailure => 'error' in result);
  for (const iconFailure of iconFailures) {
    for (const linked of monstersByImage.get(iconFailure.imageId) ?? []) {
      failures.push(
        failureFromError(
          linked.requirement,
          iconFailure.endpoint,
          iconFailure.error,
          'failed-image-download'
        )
      );
    }
  }

  const monsters: EnemyAssetManifest['monsters'] = {};
  for (const success of detailSuccesses) {
    if (!successfulImageIds.has(success.monster.imageId)) continue;
    monsters[success.requirement.id] = {
      name: success.monster.name,
      imageId: success.monster.imageId,
      icon: `/generated-enemy-assets/icons/Monster_${success.monster.imageId}.webp`
    };
  }
  const manifest: EnemyAssetManifest = {
    schemaVersion: ENEMY_ASSET_SCHEMA_VERSION,
    source: 'static.nanoka.cc',
    version,
    generatedAt: now().toISOString(),
    resourceType: 'MonsterMiddleIcon',
    monsters
  };
  await writeFileAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const referencedImageIds = new Set(Object.values(monsters).map((entry) => entry.imageId));
  const prunedImages =
    failures.length === 0 ? await pruneEnemyIcons(referencedImageIds, iconRoot) : 0;
  const iconDirectoryBytes = await directoryFileSize(iconRoot);
  const mappingBytes = (await stat(manifestPath)).size;
  const successes = iconResults.filter((result): result is IconSuccess => 'disposition' in result);
  const stats: EnemyAssetSyncStats = {
    totalMonsterTemplateIds: requirements.length,
    resolvedMonsterDetails: detailSuccesses.length,
    mappedMonsterTemplateIds: Object.keys(monsters).length,
    uniqueImageIds: uniqueImages.length,
    newImages: successes.filter((item) => item.disposition === 'created').length,
    replacedImages: successes.filter((item) => item.disposition === 'replaced').length,
    downloadedImages: successes.filter((item) => item.disposition !== 'skipped').length,
    skippedImages: successes.filter((item) => item.disposition === 'skipped').length,
    prunedImages,
    missingMonsterJson: failures.filter((failure) => failure.kind === 'missing-monster-json')
      .length,
    missingImagePath: failures.filter((failure) => failure.kind === 'missing-image-path').length,
    failedMonsterJson: failures.filter((failure) =>
      ['failed-monster-json', 'invalid-monster-json'].includes(failure.kind)
    ).length,
    failedImageDownloads: iconFailures.length,
    iconDirectoryBytes,
    mappingBytes
  };
  const result = { version, manifest, failures, stats };

  await printSanityChecks(result, log, iconRoot);
  printSummary(result, log);
  if (failures.length) {
    log('Missing/failed summary：');
    for (const failure of failures) {
      log(
        `  ${failure.monsterTemplateId}\t${failure.name}\t${failure.kind}\t${failure.status ?? '-'}\t${failure.endpoint}\t${failure.reason}`
      );
    }
  }
  return result;
}

function commandLineOptions(args: string[]): { force: boolean; useCurl: boolean } {
  const unknown = args.filter((argument) => !['--', '--force', '--curl'].includes(argument));
  if (unknown.length) {
    throw new Error(`未知参数：${unknown.join(', ')}；仅支持 --force 和 --curl。`);
  }
  return { force: args.includes('--force'), useCurl: args.includes('--curl') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const cli = commandLineOptions(process.argv.slice(2));
    const result = await syncEnemyAssets({
      force: cli.force,
      ...(cli.useCurl ? { fetchImpl: createCurlFetch() } : {})
    });
    if (result.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
