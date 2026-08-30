import path from 'node:path';
import { assertAssetRoot, resolveAssetRoot } from './paths.js';
import {
  ELEMENT_SOURCE_NAMES,
  manifestCoversRequirements,
  PATH_SOURCE_NAMES,
  readAssetManifest,
  readAssetRequirements,
  validateGeneratedAssetFiles,
  warnAssetFallback,
  VISUAL_ASSET_SCHEMA_VERSION
} from './shared.js';

export async function verifyAssets(): Promise<void> {
  assertAssetRoot(resolveAssetRoot());
  const requirements = await readAssetRequirements();
  const manifest = await readAssetManifest();
  if (!manifest) throw new Error('缺少视觉资源 manifest，请先运行 pnpm assets:sync。');
  if (manifest.schemaVersion !== VISUAL_ASSET_SCHEMA_VERSION) {
    throw new Error(`视觉资源 schema 不匹配：${manifest.schemaVersion}`);
  }
  if (!manifestCoversRequirements(manifest, requirements)) {
    throw new Error('视觉资源 manifest 未覆盖当前角色、属性和命途需求。');
  }
  await validateGeneratedAssetFiles(manifest);
  for (const code of requirements.elements) {
    if (!ELEMENT_SOURCE_NAMES[code]) throw new Error(`缺少属性图标映射：${code}`);
  }
  for (const code of requirements.paths) {
    if (!PATH_SOURCE_NAMES[code]) throw new Error(`缺少命途图标映射：${code}`);
  }
  console.log(
    `视觉资源验证通过：${manifest.characters.previews.available.length} 角色预览图、${manifest.characters.portraits.available.length} 角色立绘、${manifest.lightCones.previews.available.length} 光锥预览图、${manifest.lightCones.portraits.available.length} 光锥立绘、${manifest.relics.icons.available.length} 遗器套装图标、${manifest.relics.pieces.available.length} 遗器部件图标、${manifest.relicProperties.icons.available.length} 遗器属性图标、${manifest.elements.available.length} 属性图标、${manifest.paths.available.length} 命途图标、${manifest.navigation.icons.available.length} 导航图标。`
  );
  warnAssetFallback(
    manifest,
    `验证 StarRailRes ${manifest.sourceCommit?.slice(0, 12) ?? 'unknown'}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await verifyAssets();
}
