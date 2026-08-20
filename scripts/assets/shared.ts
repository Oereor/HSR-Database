import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { CatalogEntry } from '../../src/lib/domain/types.js';
import type { AssetAvailability, VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import { generatedRoot } from '../data/paths.js';
import {
  assetManifestPath,
  assetManifestRoot,
  assertAssetOutputPaths,
  generatedAssetRoot,
  generatedPreviewRoot,
  generatedElementRoot,
  generatedPathRoot,
  generatedPortraitRoot
} from './paths.js';

export const VISUAL_ASSET_SCHEMA_VERSION = 3 as const;

export const ELEMENT_SOURCE_NAMES: Readonly<Record<string, string>> = {
  Physical: 'Physical',
  Fire: 'Fire',
  Ice: 'Ice',
  Lightning: 'Thunder',
  Wind: 'Wind',
  Quantum: 'Quantum',
  Imaginary: 'Imaginary'
};

export const PATH_SOURCE_NAMES: Readonly<Record<string, string>> = {
  Warrior: 'Destruction',
  Rogue: 'Hunt',
  Mage: 'Erudition',
  Shaman: 'Harmony',
  Warlock: 'Nihility',
  Knight: 'Preservation',
  Priest: 'Abundance',
  Memory: 'Remembrance',
  Elation: 'Elation'
};

export interface AssetRequirements {
  characterIds: string[];
  elements: string[];
  paths: string[];
}

export interface AssetSizeSummary {
  previews: number;
  portraits: number;
  elements: number;
  paths: number;
  total: number;
}

const uniqueSorted = (values: Array<string | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => !!value))].sort((a, b) =>
    a.localeCompare(b)
  );

export async function readAssetRequirements(): Promise<AssetRequirements> {
  const catalogPath = path.join(generatedRoot, 'catalogs', 'characters.json');
  let catalog: CatalogEntry[];
  try {
    catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as CatalogEntry[];
  } catch (error) {
    throw new Error(`无法读取角色目录 ${catalogPath}；请先运行 pnpm data:ensure。`, {
      cause: error
    });
  }
  return {
    characterIds: uniqueSorted(catalog.map((entry) => entry.id)),
    elements: uniqueSorted(catalog.map((entry) => entry.element)),
    paths: uniqueSorted(catalog.map((entry) => entry.path))
  };
}

export async function readCharacterIds(): Promise<string[]> {
  return (await readAssetRequirements()).characterIds;
}

export async function readAssetManifest(): Promise<VisualAssetManifest | undefined> {
  try {
    return JSON.parse(await readFile(assetManifestPath, 'utf8')) as VisualAssetManifest;
  } catch {
    return undefined;
  }
}

export async function writeAssetManifest(manifest: VisualAssetManifest): Promise<void> {
  assertAssetOutputPaths();
  await mkdir(assetManifestRoot, { recursive: true });
  await writeFile(assetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function emptyAssetManifest(requirements: AssetRequirements): VisualAssetManifest {
  const unavailable = (values: string[]): AssetAvailability => ({ available: [], missing: values });
  return {
    schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    characters: {
      previews: unavailable(requirements.characterIds),
      portraits: unavailable(requirements.characterIds)
    },
    elements: unavailable(requirements.elements),
    paths: unavailable(requirements.paths)
  };
}

export async function cleanGeneratedAssets(): Promise<void> {
  assertAssetCleanTarget(generatedAssetRoot);
  assertAssetCleanTarget(assetManifestPath);
  await rm(generatedAssetRoot, { recursive: true, force: true });
  await rm(assetManifestPath, { force: true });
  await mkdir(generatedAssetRoot, { recursive: true });
  await writeFile(path.join(generatedAssetRoot, '.gitkeep'), '', 'utf8');
  await mkdir(assetManifestRoot, { recursive: true });
  await writeFile(path.join(assetManifestRoot, '.gitkeep'), '', 'utf8');
}

export function assertAssetCleanTarget(target: string): void {
  assertAssetOutputPaths();
  const resolved = path.resolve(target);
  if (resolved !== generatedAssetRoot && resolved !== assetManifestPath) {
    throw new Error(`拒绝清理非生成视觉资源路径：${resolved}`);
  }
}

async function resetOutputDirectories(): Promise<void> {
  assertAssetOutputPaths();
  await rm(generatedAssetRoot, { recursive: true, force: true });
  await Promise.all(
    [generatedPreviewRoot, generatedPortraitRoot, generatedElementRoot, generatedPathRoot].map(
      (directory) => mkdir(directory, { recursive: true })
    )
  );
}

async function processRequested(
  requested: string[],
  sourcePath: (value: string) => string | undefined,
  outputPath: (value: string) => string,
  transform: (source: string, output: string) => Promise<void>
): Promise<AssetAvailability> {
  const available: string[] = [];
  const missing: string[] = [];
  for (const value of requested) {
    const source = sourcePath(value);
    try {
      if (!source) throw new Error(`缺少资源来源：${value}`);
      await stat(source);
      await transform(source, outputPath(value));
      available.push(value);
    } catch {
      missing.push(value);
    }
  }
  return { available, missing };
}

interface CharacterResourceIndexEntry {
  preview?: unknown;
}

export function resolveIndexedAssetPath(sourceRoot: string, relativePath: unknown): string {
  if (typeof relativePath !== 'string' || !relativePath.trim())
    throw new Error('StarRailRes index 缺少有效资源路径');
  const normalized = relativePath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..'))
    throw new Error(`StarRailRes index 包含越界资源路径：${relativePath}`);
  const resolvedRoot = path.resolve(sourceRoot);
  const resolved = path.resolve(resolvedRoot, ...normalized.split('/'));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error(`StarRailRes index 包含越界资源路径：${relativePath}`);
  return resolved;
}

export async function readCharacterPreviewSources(
  sourceRoot: string,
  characterIds: string[]
): Promise<ReadonlyMap<string, string>> {
  const indexPath = path.join(sourceRoot, 'index_new', 'cn', 'characters.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<
    string,
    CharacterResourceIndexEntry
  >;
  if (!index || typeof index !== 'object' || Array.isArray(index))
    throw new Error(`StarRailRes 角色 index 格式异常：${indexPath}`);
  const sources = new Map<string, string>();
  for (const id of characterIds) {
    const preview = index[id]?.preview;
    if (preview === undefined) continue;
    const source = resolveIndexedAssetPath(sourceRoot, preview);
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    if (!/^image\/character_preview\/[^/]+\.png$/i.test(relative))
      throw new Error(`角色 ${id} 的 preview 路径不属于 character_preview：${relative}`);
    sources.set(id, source);
  }
  return sources;
}

export async function writePortraitAsset(source: string, output: string): Promise<void> {
  await sharp(source)
    .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84, alphaQuality: 100 })
    .toFile(output);
}

export async function writeSemanticIconAsset(source: string, output: string): Promise<void> {
  await sharp(source).resize(64, 64, { fit: 'contain' }).png().toFile(output);
}

export async function generateVisualAssets(
  sourceRoot: string,
  requirements: AssetRequirements
): Promise<Omit<VisualAssetManifest, 'schemaVersion' | 'sourceCommit' | 'generatedAt'>> {
  await resetOutputDirectories();
  const previewSources = await readCharacterPreviewSources(sourceRoot, requirements.characterIds);
  const previews = await processRequested(
    requirements.characterIds,
    (id) => previewSources.get(id),
    (id) => path.join(generatedPreviewRoot, `${id}.png`),
    async (source, output) => copyFile(source, output)
  );
  const portraits = await processRequested(
    requirements.characterIds,
    (id) => path.join(sourceRoot, 'image', 'character_portrait', `${id}.png`),
    (id) => path.join(generatedPortraitRoot, `${id}.webp`),
    writePortraitAsset
  );
  const elements = await processRequested(
    requirements.elements,
    (code) => path.join(sourceRoot, 'icon', 'element', `${ELEMENT_SOURCE_NAMES[code]}.png`),
    (code) => path.join(generatedElementRoot, `${code}.png`),
    writeSemanticIconAsset
  );
  const paths = await processRequested(
    requirements.paths,
    (code) => path.join(sourceRoot, 'icon', 'path', `${PATH_SOURCE_NAMES[code]}.png`),
    (code) => path.join(generatedPathRoot, `${code}.png`),
    writeSemanticIconAsset
  );
  return { characters: { previews, portraits }, elements, paths };
}

const collectionCovers = (collection: AssetAvailability, required: string[]): boolean => {
  const recorded = [...collection.available, ...collection.missing].sort((a, b) =>
    a.localeCompare(b)
  );
  return (
    recorded.length === required.length &&
    recorded.every((value, index) => value === required[index])
  );
};

export function manifestCoversRequirements(
  manifest: VisualAssetManifest,
  requirements: AssetRequirements
): boolean {
  return (
    manifest.schemaVersion === VISUAL_ASSET_SCHEMA_VERSION &&
    collectionCovers(manifest.characters.previews, requirements.characterIds) &&
    collectionCovers(manifest.characters.portraits, requirements.characterIds) &&
    collectionCovers(manifest.elements, requirements.elements) &&
    collectionCovers(manifest.paths, requirements.paths)
  );
}

export function manifestCoversCharacters(
  manifest: VisualAssetManifest,
  characterIds: string[]
): boolean {
  return (
    manifest.schemaVersion === VISUAL_ASSET_SCHEMA_VERSION &&
    collectionCovers(manifest.characters.previews, characterIds) &&
    collectionCovers(manifest.characters.portraits, characterIds)
  );
}

const expectedFiles = (manifest: VisualAssetManifest): Array<[string, string[]]> => [
  [generatedPreviewRoot, manifest.characters.previews.available.map((id) => `${id}.png`)],
  [generatedPortraitRoot, manifest.characters.portraits.available.map((id) => `${id}.webp`)],
  [generatedElementRoot, manifest.elements.available.map((code) => `${code}.png`)],
  [generatedPathRoot, manifest.paths.available.map((code) => `${code}.png`)]
];

export async function manifestFilesExist(manifest: VisualAssetManifest): Promise<boolean> {
  try {
    for (const [directory, requiredFiles] of expectedFiles(manifest)) {
      const files = new Set(await readdir(directory));
      if (!requiredFiles.every((file) => files.has(file))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function directorySize(directory: string): Promise<number> {
  try {
    const files = await readdir(directory, { withFileTypes: true });
    const sizes = await Promise.all(
      files.filter((file) => file.isFile()).map((file) => stat(path.join(directory, file.name)))
    );
    return sizes.reduce((sum, metadata) => sum + metadata.size, 0);
  } catch {
    return 0;
  }
}

export async function assetSizeSummary(): Promise<AssetSizeSummary> {
  const [previews, portraits, elements, paths] = await Promise.all([
    directorySize(generatedPreviewRoot),
    directorySize(generatedPortraitRoot),
    directorySize(generatedElementRoot),
    directorySize(generatedPathRoot)
  ]);
  return { previews, portraits, elements, paths, total: previews + portraits + elements + paths };
}
