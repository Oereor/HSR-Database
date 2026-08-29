import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assertInsideSite, siteRoot } from '../data/paths.js';

export const assetManifestRoot = path.join(siteRoot, 'src', 'lib', 'generated-assets');
export const assetManifestPath = path.join(assetManifestRoot, 'manifest.json');
export const generatedAssetRoot = path.join(siteRoot, 'static', 'generated-assets');
export const generatedCharacterRoot = path.join(generatedAssetRoot, 'characters');
export const generatedPreviewRoot = path.join(generatedCharacterRoot, 'preview');
export const generatedPortraitRoot = path.join(generatedCharacterRoot, 'portrait');
export const generatedLightConeRoot = path.join(generatedAssetRoot, 'light-cones');
export const generatedLightConePreviewRoot = path.join(generatedLightConeRoot, 'preview');
export const generatedLightConePortraitRoot = path.join(generatedLightConeRoot, 'portrait');
export const generatedRelicRoot = path.join(generatedAssetRoot, 'relics');
export const generatedRelicIconRoot = path.join(generatedRelicRoot, 'icons');
export const generatedRelicPieceRoot = path.join(generatedRelicRoot, 'pieces');
export const generatedRelicPropertyRoot = path.join(generatedAssetRoot, 'relic-properties');
export const generatedElementRoot = path.join(generatedAssetRoot, 'elements');
export const generatedPathRoot = path.join(generatedAssetRoot, 'paths');

const requiredDirectories = [
  ['index_new', 'cn', 'characters.json'],
  ['index_new', 'cn', 'light_cones.json'],
  ['index_new', 'cn', 'relic_sets.json'],
  ['index_new', 'cn', 'relics.json'],
  ['index_new', 'cn', 'properties.json'],
  ['image', 'character_preview'],
  ['image', 'character_portrait'],
  ['image', 'light_cone_preview'],
  ['image', 'light_cone_portrait'],
  ['icon', 'relic'],
  ['icon', 'property'],
  ['icon', 'element'],
  ['icon', 'path']
] as const;

export function resolveAssetRoot(value = process.env.HSR_ASSET_ROOT): string {
  return path.resolve(siteRoot, value?.trim() || '../StarRailRes');
}

export function assertAssetRoot(root = resolveAssetRoot()): string {
  if (!existsSync(root)) {
    throw new Error(
      `找不到视觉资源目录：${root}\n请设置 HSR_ASSET_ROOT，且不要让脚本自动创建或克隆该目录。`
    );
  }
  if (!existsSync(path.join(root, '.git'))) {
    throw new Error('HSR_ASSET_ROOT 不是预期的 StarRailRes Git 仓库，缺少 .git。');
  }
  const missing = requiredDirectories
    .map((parts) => path.join(...parts))
    .filter((relative) => !existsSync(path.join(root, relative)));
  if (missing.length) {
    throw new Error(`HSR_ASSET_ROOT 缺少视觉资源目录：${missing.join(', ')}`);
  }
  return root;
}

export function assetSourceCommit(root = assertAssetRoot()): string {
  return execFileSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
}

export function assertAssetOutputPaths(): void {
  for (const output of [
    assetManifestRoot,
    generatedAssetRoot,
    generatedPreviewRoot,
    generatedPortraitRoot,
    generatedLightConeRoot,
    generatedLightConePreviewRoot,
    generatedLightConePortraitRoot,
    generatedRelicRoot,
    generatedRelicIconRoot,
    generatedRelicPieceRoot,
    generatedRelicPropertyRoot,
    generatedElementRoot,
    generatedPathRoot
  ]) {
    assertInsideSite(output);
  }
}
