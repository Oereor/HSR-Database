import path from 'node:path';
import sharp from 'sharp';
import {
  assertAssetRoot,
  generatedPreviewRoot,
  generatedLightConePreviewRoot,
  generatedRelicIconRoot,
  generatedRelicPropertyRoot,
  generatedElementRoot,
  generatedPathRoot,
  generatedPortraitRoot,
  resolveAssetRoot
} from './paths.js';
import {
  ELEMENT_SOURCE_NAMES,
  manifestCoversRequirements,
  manifestFilesExist,
  PATH_SOURCE_NAMES,
  readAssetManifest,
  readAssetRequirements,
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
  if (!(await manifestFilesExist(manifest))) {
    throw new Error('视觉资源 manifest 与生成文件不一致。');
  }
  for (const code of requirements.elements) {
    if (!ELEMENT_SOURCE_NAMES[code]) throw new Error(`缺少属性图标映射：${code}`);
  }
  for (const code of requirements.paths) {
    if (!PATH_SOURCE_NAMES[code]) throw new Error(`缺少命途图标映射：${code}`);
  }
  for (const id of manifest.characters.previews.available) {
    const metadata = await sharp(path.join(generatedPreviewRoot, `${id}.png`)).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
      throw new Error(`生成角色预览图格式或尺寸异常：${id}`);
    }
  }
  for (const id of manifest.characters.portraits.available) {
    const metadata = await sharp(path.join(generatedPortraitRoot, `${id}.webp`)).metadata();
    if (
      metadata.format !== 'webp' ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 960 ||
      metadata.height > 960
    ) {
      throw new Error(`生成立绘格式或尺寸异常：${id}`);
    }
  }
  for (const id of manifest.lightCones.previews.available) {
    const metadata = await sharp(path.join(generatedLightConePreviewRoot, `${id}.png`)).metadata();
    if (metadata.format !== 'png' || metadata.width !== 348 || metadata.height !== 408) {
      throw new Error(`生成光锥预览图格式或尺寸异常：${id}`);
    }
  }
  for (const id of manifest.relics.icons.available) {
    const metadata = await sharp(path.join(generatedRelicIconRoot, `${id}.png`)).metadata();
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器套装图标格式或尺寸异常：${id}`);
  }
  for (const iconKey of manifest.relicProperties.icons.available) {
    const metadata = await sharp(
      path.join(generatedRelicPropertyRoot, `${iconKey}.png`)
    ).metadata();
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器属性图标格式或尺寸异常：${iconKey}`);
  }
  for (const code of manifest.elements.available) {
    const metadata = await sharp(path.join(generatedElementRoot, `${code}.png`)).metadata();
    if (metadata.width !== 64 || metadata.height !== 64)
      throw new Error(`属性图标尺寸异常：${code}`);
  }
  for (const code of manifest.paths.available) {
    const metadata = await sharp(path.join(generatedPathRoot, `${code}.png`)).metadata();
    if (metadata.width !== 64 || metadata.height !== 64)
      throw new Error(`命途图标尺寸异常：${code}`);
  }
  console.log(
    `视觉资源验证通过：${manifest.characters.previews.available.length} 角色预览图、${manifest.characters.portraits.available.length} 立绘、${manifest.lightCones.previews.available.length} 光锥预览图、${manifest.relics.icons.available.length} 遗器套装图标、${manifest.relicProperties.icons.available.length} 遗器属性图标、${manifest.elements.available.length} 属性图标、${manifest.paths.available.length} 命途图标。`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await verifyAssets();
}
