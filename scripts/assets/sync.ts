import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import {
  assertAssetOutputPaths,
  assertAssetRoot,
  assetSourceCommit,
  generatedAssetRoot,
  resolveAssetRoot
} from './paths.js';
import {
  assetSizeSummary,
  emptyAssetManifest,
  generateVisualAssets,
  manifestCoversRequirements,
  manifestFilesExist,
  readAssetManifest,
  readAssetRequirements,
  validateGeneratedAssetFiles,
  VISUAL_ASSET_SCHEMA_VERSION,
  warnAssetFallback,
  writeAssetManifest
} from './shared.js';

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

async function publishGeneratedAssets(
  stagingRoot: string,
  manifest: VisualAssetManifest
): Promise<void> {
  assertAssetOutputPaths();
  const parent = path.dirname(generatedAssetRoot);
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
      await rename(generatedAssetRoot, backupRoot);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(resolvedStage, generatedAssetRoot);
    published = true;
    await writeAssetManifest(manifest);
  } catch (error) {
    if (published)
      await rm(generatedAssetRoot, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200
      });
    if (backedUp) await rename(backupRoot, generatedAssetRoot);
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

export async function syncAssets(): Promise<VisualAssetManifest> {
  const requirements = await readAssetRequirements();
  const cached = await readAssetManifest();
  let root: string;
  let sourceCommit: string;
  try {
    root = assertAssetRoot(resolveAssetRoot());
    sourceCommit = assetSourceCommit(root);
  } catch (error) {
    const validCache =
      !!cached &&
      manifestCoversRequirements(cached, requirements) &&
      (await manifestFilesExist(cached));
    if (validCache) {
      console.warn(`视觉资源上游暂不可用，保留已有缓存：${(error as Error).message}`);
      return cached;
    }
    const manifest = emptyAssetManifest(requirements);
    await writeAssetManifest(manifest);
    console.warn(`视觉资源上游暂不可用，已启用无图片降级：${(error as Error).message}`);
    return manifest;
  }

  const stagingParent = path.dirname(generatedAssetRoot);
  await mkdir(stagingParent, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(stagingParent, '.generated-assets-stage-'));
  let manifest: VisualAssetManifest;
  try {
    const generated = await generateVisualAssets(root, requirements, stagingRoot);
    manifest = {
      schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
      sourceCommit,
      generatedAt: new Date().toISOString(),
      ...generated
    };
    await validateGeneratedAssetFiles(manifest, stagingRoot);
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
  const sizes = await assetSizeSummary();
  console.log(`视觉资源同步完成（StarRailRes ${sourceCommit.slice(0, 12)}）：`);
  console.log(
    `  角色预览图 ${manifest.characters.previews.available.length}，缺失 ${manifest.characters.previews.missing.length}，${mb(sizes.previews)}`
  );
  console.log(
    `  角色立绘 ${manifest.characters.portraits.available.length}，缺失 ${manifest.characters.portraits.missing.length}，${mb(sizes.portraits)}`
  );
  console.log(
    `  光锥预览图 ${manifest.lightCones.previews.available.length}，缺失 ${manifest.lightCones.previews.missing.length}，${mb(sizes.lightConePreviews)}`
  );
  console.log(
    `  光锥立绘 ${manifest.lightCones.portraits.available.length}，缺失 ${manifest.lightCones.portraits.missing.length}，${mb(sizes.lightConePortraits)}`
  );
  console.log(
    `  遗器套装图标 ${manifest.relics.icons.available.length}，缺失 ${manifest.relics.icons.missing.length}；遗器部件图标 ${manifest.relics.pieces.available.length}，缺失 ${manifest.relics.pieces.missing.length}；遗器属性图标 ${manifest.relicProperties.icons.available.length}，缺失 ${manifest.relicProperties.icons.missing.length}，合计 ${mb(sizes.relicIcons + sizes.relicPieces + sizes.relicPropertyIcons)}`
  );
  console.log(
    `  属性图标 ${manifest.elements.available.length}，缺失 ${manifest.elements.missing.length}；命途图标 ${manifest.paths.available.length}，缺失 ${manifest.paths.missing.length}，合计 ${mb(sizes.elements + sizes.paths)}`
  );
  console.log(
    `  导航图标 ${manifest.navigation.icons.available.length}，缺失 ${manifest.navigation.icons.missing.length}，${mb(sizes.navigation)}`
  );
  console.log(
    `  品牌图标 ${manifest.branding.icons.available.length}，缺失 ${manifest.branding.icons.missing.length}，${mb(sizes.branding)}`
  );
  console.log(
    `  工具图标 ${manifest.utility.icons.available.length}，缺失 ${manifest.utility.icons.missing.length}，${mb(sizes.utility)}`
  );
  console.log(
    `  高难模式图标 ${manifest.endgame.modeIcons.available.length}，缺失 ${manifest.endgame.modeIcons.missing.length}，${mb(sizes.endgameModeIcons)}`
  );
  console.log(`  输出总计 ${mb(sizes.total)}`);
  warnAssetFallback(manifest, `StarRailRes ${sourceCommit.slice(0, 12)}`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await syncAssets();
}
