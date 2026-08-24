import path from 'node:path';
import type { VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import { assertAssetRoot, assetSourceCommit, resolveAssetRoot } from './paths.js';
import {
  assetSizeSummary,
  emptyAssetManifest,
  generateVisualAssets,
  manifestCoversRequirements,
  manifestFilesExist,
  readAssetManifest,
  readAssetRequirements,
  VISUAL_ASSET_SCHEMA_VERSION,
  writeAssetManifest
} from './shared.js';

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

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

  const generated = await generateVisualAssets(root, requirements);
  const manifest: VisualAssetManifest = {
    schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
    sourceCommit,
    generatedAt: new Date().toISOString(),
    ...generated
  };
  await writeAssetManifest(manifest);
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
    `  属性图标 ${manifest.elements.available.length}，缺失 ${manifest.elements.missing.length}；命途图标 ${manifest.paths.available.length}，缺失 ${manifest.paths.missing.length}，合计 ${mb(sizes.elements + sizes.paths)}`
  );
  console.log(`  输出总计 ${mb(sizes.total)}`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await syncAssets();
}
