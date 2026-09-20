import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import { resolveDataRoot } from '../data/paths.js';
import {
  assertAssetOutputPaths,
  assertAssetRoot,
  assetSourceCommit,
  generatedAssetRoot,
  resolveAssetRoot
} from './paths.js';
import {
  assetRequirementsFingerprint,
  emptyAssetManifest,
  generateVisualAssetsWithStats,
  manifestCoversRequirements,
  manifestFilesExist,
  observeGeneratedAssetFiles,
  readAssetManifest,
  readAssetRequirements,
  validateGeneratedAssetFiles,
  VISUAL_ASSET_SCHEMA_VERSION,
  warnAssetFallback,
  writeAssetManifest
} from './shared.js';
import type { AssetGenerationStats, AssetRequirements } from './shared.js';
import type { AssetFilesystemObservation } from './observation.js';

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

export async function publishGeneratedAssets(
  stagingRoot: string,
  manifest: VisualAssetManifest,
  options: {
    generatedRoot?: string;
    writeManifest?: (manifest: VisualAssetManifest) => Promise<void>;
  } = {}
): Promise<void> {
  const destinationRoot = options.generatedRoot ?? generatedAssetRoot;
  const writeManifest = options.writeManifest ?? writeAssetManifest;
  if (!options.generatedRoot) assertAssetOutputPaths();
  const parent = path.dirname(destinationRoot);
  const resolvedStage = path.resolve(stagingRoot);
  if (
    path.dirname(resolvedStage) !== parent ||
    !path.basename(resolvedStage).startsWith('.generated-assets-stage-')
  ) {
    throw new Error(`拒绝发布非预期视觉资源暂存目录：${resolvedStage}`);
  }
  const backupRoot = path.join(parent, `.generated-assets-backup-${process.pid}-${Date.now()}`);
  let backedUp = false;
  let published = false;
  try {
    try {
      await rename(destinationRoot, backupRoot);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(resolvedStage, destinationRoot);
    published = true;
    await writeManifest(manifest);
  } catch (error) {
    if (published)
      await rm(destinationRoot, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200
      });
    if (backedUp) await rename(backupRoot, destinationRoot);
    throw error;
  }
  if (backedUp) {
    try {
      await rm(backupRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      console.warn(`旧视觉资源备份清理失败，当前发布仍然有效：${(error as Error).message}`);
    }
  }
}

export interface SyncAssetsOptions {
  requirements?: AssetRequirements;
  env?: NodeJS.ProcessEnv;
}

export interface SyncAssetsResult {
  manifest: VisualAssetManifest;
  observation?: AssetFilesystemObservation;
  generationStats?: AssetGenerationStats;
}

export async function syncAssets(options: SyncAssetsOptions = {}): Promise<SyncAssetsResult> {
  const env = options.env ?? process.env;
  const requirements =
    options.requirements ?? (await readAssetRequirements(resolveDataRoot(env.HSR_DATA_ROOT)));
  const cached = await readAssetManifest();
  let root: string;
  let sourceCommit: string;
  try {
    root = assertAssetRoot(resolveAssetRoot(env.HSR_ASSET_ROOT));
    sourceCommit = assetSourceCommit(root);
  } catch (error) {
    if (env.HSR_DEPLOYMENT_BUILD === '1') throw error;
    const validCache =
      !!cached &&
      (!env.HSR_EXPECTED_ASSET_COMMIT || cached.sourceCommit === env.HSR_EXPECTED_ASSET_COMMIT) &&
      cached.requirementsFingerprint === assetRequirementsFingerprint(requirements) &&
      manifestCoversRequirements(cached, requirements) &&
      (await manifestFilesExist(cached));
    if (validCache) {
      console.warn(`视觉资源上游暂不可用，保留已有缓存：${(error as Error).message}`);
      return { manifest: cached };
    }
    const manifest = emptyAssetManifest(requirements);
    await writeAssetManifest(manifest);
    console.warn(`视觉资源上游暂不可用，已启用无图片降级：${(error as Error).message}`);
    return { manifest };
  }

  const stagingParent = path.dirname(generatedAssetRoot);
  await mkdir(stagingParent, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(stagingParent, '.generated-assets-stage-'));
  let manifest: VisualAssetManifest;
  let generationStats: AssetGenerationStats;
  try {
    const generated = await generateVisualAssetsWithStats(root, requirements, stagingRoot);
    generationStats = generated.stats;
    manifest = {
      schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
      requirementsFingerprint: assetRequirementsFingerprint(requirements),
      sourceCommit,
      generatedAt: new Date().toISOString(),
      ...generated.assets
    };
    const stagingObservation = await validateGeneratedAssetFiles(manifest, stagingRoot);
    console.log(
      `[assets:validation] root=staging files=${stagingObservation.summary.files} bytes=${stagingObservation.summary.bytes} metadata=${stagingObservation.metadataInspections}`
    );
    await publishGeneratedAssets(stagingRoot, manifest);
  } catch (error) {
    console.error(`视觉资源同步失败，正式缓存保持不变：${(error as Error).message}`);
    try {
      await rm(stagingRoot, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200
      });
    } catch (cleanupError) {
      console.warn(`视觉资源暂存目录清理失败：${(cleanupError as Error).message}`);
    }
    throw error;
  }
  await rm(stagingRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  const observation = await observeGeneratedAssetFiles();
  console.log(`视觉资源同步完成（StarRailRes ${sourceCommit.slice(0, 12)}）：`);
  console.log(
    `  角色预览图 ${manifest.characters.previews.available.length}，缺失 ${manifest.characters.previews.missing.length}`
  );
  console.log(
    `  角色立绘 ${manifest.characters.portraits.available.length}，缺失 ${manifest.characters.portraits.missing.length}`
  );
  console.log(
    `  玩家头像 ${manifest.playerAvatars.available.length}，缺失 ${manifest.playerAvatars.missing.length}`
  );
  console.log(
    `  角色详情 icon ${Object.keys(manifest.characterDetails.icons.resolved).length}，缺失 ${manifest.characterDetails.icons.missing.length}，去重文件 ${new Set(Object.values(manifest.characterDetails.icons.resolved)).size}`
  );
  console.log(
    `[assets:generation] copies=${generationStats.copyOperations} sharp=${generationStats.sharpOperations} missing=${generationStats.missing} copy-concurrency=${generationStats.copyConcurrency} sharp-concurrency=${generationStats.sharpConcurrency} overlap=${generationStats.overlapPools}`
  );
  console.log(`  输出总计 ${observation.summary.files} files，${mb(observation.summary.bytes)}`);
  warnAssetFallback(manifest, `StarRailRes ${sourceCommit.slice(0, 12)}`);
  return { manifest, observation, generationStats };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await syncAssets();
}
