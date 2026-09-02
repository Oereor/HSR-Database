import path from 'node:path';
import { createCurlFetch } from './curl.js';
import {
  NANOKA_BASE_URL,
  enemyAssetManifestPath,
  enemyAssetRoot,
  enemyIconRoot,
  fetchNanokaVersion,
  readEnemyAssetManifest,
  readEnemyRequirements,
  validateEnemyAssetCache,
  type EnemyAssetCacheValidation,
  type RetryOptions
} from './shared.js';
import { syncEnemyAssets, type EnemyAssetSyncOptions, type EnemyAssetSyncResult } from './sync.js';

const PROXY_ENVIRONMENT_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy'
] as const;

export type EnemyAssetEnsureOptions = EnemyAssetSyncOptions;

export interface EnemyAssetEnsureResult {
  disposition: 'reused' | 'synced';
  version: string;
  validation: EnemyAssetCacheValidation;
  syncResult?: EnemyAssetSyncResult;
}

export function hasProxyEnvironment(environment: NodeJS.ProcessEnv = process.env): boolean {
  return PROXY_ENVIRONMENT_KEYS.some((key) => Boolean(environment[key]?.trim()));
}

export function shouldUseCurlTransport(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return args.includes('--curl') || hasProxyEnvironment(environment);
}

export async function ensureEnemyAssets(
  options: EnemyAssetEnsureOptions = {}
): Promise<EnemyAssetEnsureResult> {
  const baseUrl = (options.baseUrl ?? NANOKA_BASE_URL).replace(/\/$/, '');
  const log = options.log ?? console.log;
  const assetRoot = options.assetRoot ?? enemyAssetRoot;
  const iconRoot = options.assetRoot === undefined ? enemyIconRoot : path.join(assetRoot, 'icons');
  const manifestPath =
    options.assetRoot === undefined ? enemyAssetManifestPath : path.join(assetRoot, 'index.json');
  const requirements = await readEnemyRequirements(options.catalogFile);
  const manifest = await readEnemyAssetManifest(manifestPath);
  const validation = await validateEnemyAssetCache(requirements, manifest, iconRoot);
  const retryOptions: RetryOptions = {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
    ...(options.sleep ? { sleep: options.sleep } : {})
  };

  let latestVersion: string;
  try {
    latestVersion = await fetchNanokaVersion(baseUrl, retryOptions);
  } catch (error) {
    if (validation.valid && manifest) {
      console.warn(`Nanoka 暂不可用，继续使用完整 enemy cache：${(error as Error).message}`);
      return { disposition: 'reused', version: manifest.version, validation };
    }
    throw new Error(
      `enemy cache 不可用（${validation.reason ?? 'unknown'}），且无法读取 Nanoka 版本：${(error as Error).message}`,
      { cause: error }
    );
  }

  if (!options.force && validation.valid && manifest?.version === latestVersion) {
    log(
      `敌人资源已是最新版本：Nanoka ${latestVersion}，${validation.mappedMonsterTemplateIds} 条映射、${validation.uniqueImageIds} 张图片、${validation.unavailableMonsterTemplateIds} 条合法缺失。`
    );
    return { disposition: 'reused', version: latestVersion, validation };
  }

  log(
    validation.valid
      ? `Nanoka 版本变化（${manifest?.version} → ${latestVersion}），刷新敌人资源。`
      : `enemy cache 需要生成：${validation.reason ?? 'unknown'}`
  );
  const syncResult = await syncEnemyAssets(options);
  const published = await readEnemyAssetManifest(manifestPath);
  const publishedValidation = await validateEnemyAssetCache(requirements, published, iconRoot);
  if (!publishedValidation.valid) {
    throw new Error(`enemy asset ensure 发布后验证失败：${publishedValidation.reason}`);
  }
  return {
    disposition: 'synced',
    version: syncResult.version,
    validation: publishedValidation,
    syncResult
  };
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
    const args = process.argv.slice(2);
    const cli = commandLineOptions(args);
    const useCurl = shouldUseCurlTransport(args);
    console.log(`[enemy-assets] transport=${useCurl ? 'curl' : 'node-fetch'}`);
    await ensureEnemyAssets({
      force: cli.force,
      ...(useCurl ? { fetchImpl: createCurlFetch() } : {})
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
