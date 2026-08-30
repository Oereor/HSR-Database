import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type {
  CatalogEntry,
  RelicCatalogEntry,
  RelicProperty,
  RelicSet,
  RelicSlot
} from '../../src/lib/domain/types.js';
import type { AssetAvailability, VisualAssetManifest } from '../../src/lib/domain/visual-assets.js';
import { NAVIGATION_ITEMS, type NavigationIconKey } from '../../src/lib/navigation.js';
import { generatedRoot } from '../data/paths.js';
import {
  assetManifestPath,
  assetManifestRoot,
  assertAssetOutputPaths,
  generatedAssetRoot,
  generatedPreviewRoot,
  generatedLightConePreviewRoot,
  generatedLightConePortraitRoot,
  generatedRelicIconRoot,
  generatedRelicPieceRoot,
  generatedRelicPropertyRoot,
  generatedElementRoot,
  generatedNavigationRoot,
  generatedPathRoot,
  generatedPortraitRoot
} from './paths.js';

// Windows may otherwise retain recently inspected files in libvips' cache during rollback cleanup.
sharp.cache(false);

export const VISUAL_ASSET_SCHEMA_VERSION = 8 as const;

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

export const NAVIGATION_ICON_SOURCE_NAMES: Readonly<Record<NavigationIconKey, string>> = {
  overview: 'AllIcon',
  characters: 'AvatarIcon',
  'light-cones': 'ShopLightConIcon',
  relics: 'InventoryFosterIcon',
  enemies: 'IconActivityTreasureTrotter',
  endgame: 'AbyssIcon01',
  rogue: 'CampFirstWorld'
};

export interface AssetRequirements {
  characterIds: string[];
  lightConeIds: string[];
  relicSetIds: string[];
  relicPieces: Array<{ id: string; setId: string; slot: RelicSlot }>;
  relicPropertyIcons: Array<{ propertyType: string; iconKey: string }>;
  elements: string[];
  paths: string[];
  navigationIcons: NavigationIconKey[];
}

export interface AssetSizeSummary {
  previews: number;
  portraits: number;
  lightConePreviews: number;
  lightConePortraits: number;
  relicIcons: number;
  relicPieces: number;
  relicPropertyIcons: number;
  elements: number;
  paths: number;
  navigation: number;
  total: number;
}

export interface AssetOutputPaths {
  root: string;
  previews: string;
  portraits: string;
  lightConePreviews: string;
  lightConePortraits: string;
  relicIcons: string;
  relicPieces: string;
  relicPropertyIcons: string;
  elements: string;
  paths: string;
  navigation: string;
}

export interface AssetFallbackEntry {
  label: string;
  missing: string[];
}

const uniqueSorted = (values: Array<string | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => !!value))].sort((a, b) =>
    a.localeCompare(b)
  );

export async function readAssetRequirements(): Promise<AssetRequirements> {
  const characterCatalogPath = path.join(generatedRoot, 'catalogs', 'characters.json');
  const lightConeCatalogPath = path.join(generatedRoot, 'catalogs', 'light-cones.json');
  const relicCatalogPath = path.join(generatedRoot, 'catalogs', 'relics.json');
  const relicPropertyCatalogPath = path.join(generatedRoot, 'catalogs', 'relic-properties.json');
  let characterCatalog: CatalogEntry[];
  let lightConeCatalog: CatalogEntry[];
  let relicCatalog: RelicCatalogEntry[];
  let relicDetails: RelicSet[];
  let relicProperties: RelicProperty[];
  try {
    [characterCatalog, lightConeCatalog, relicCatalog, relicProperties] = (await Promise.all(
      [characterCatalogPath, lightConeCatalogPath, relicCatalogPath, relicPropertyCatalogPath].map(
        async (catalogPath) => JSON.parse(await readFile(catalogPath, 'utf8'))
      )
    )) as [CatalogEntry[], CatalogEntry[], RelicCatalogEntry[], RelicProperty[]];
    relicDetails = await Promise.all(
      relicCatalog.map(async (set) =>
        JSON.parse(
          await readFile(path.join(generatedRoot, 'details', 'relics', `${set.id}.json`), 'utf8')
        )
      )
    );
  } catch (error) {
    throw new Error(`无法读取角色、光锥或遗器目录；请先运行 pnpm data:ensure。`, {
      cause: error
    });
  }
  return {
    characterIds: uniqueSorted(characterCatalog.map((entry) => entry.id)),
    lightConeIds: uniqueSorted(lightConeCatalog.map((entry) => entry.id)),
    relicSetIds: uniqueSorted(relicCatalog.map((entry) => entry.id)),
    relicPieces: relicDetails
      .flatMap((set) =>
        set.pieces.map((piece) => ({ id: piece.id, setId: set.id, slot: piece.slot }))
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
    relicPropertyIcons: relicProperties.flatMap((property) =>
      property.iconKey ? [{ propertyType: property.propertyType, iconKey: property.iconKey }] : []
    ),
    elements: uniqueSorted(characterCatalog.map((entry) => entry.element)),
    paths: uniqueSorted([...characterCatalog, ...lightConeCatalog].map((entry) => entry.path)),
    navigationIcons: NAVIGATION_ITEMS.map((item) => item.iconKey)
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
  const temporaryPath = `${assetManifestPath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${assetManifestPath}.${process.pid}.${Date.now()}.backup`;
  let backedUp = false;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    try {
      await rename(assetManifestPath, backupPath);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(temporaryPath, assetManifestPath);
    if (backedUp) await rm(backupPath, { force: true });
  } catch (error) {
    if (backedUp) {
      await rm(assetManifestPath, { force: true });
      await rename(backupPath, assetManifestPath);
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export function assetFallbackEntries(manifest: VisualAssetManifest): AssetFallbackEntry[] {
  return [
    { label: '角色预览图', missing: manifest.characters.previews.missing },
    { label: '角色立绘', missing: manifest.characters.portraits.missing },
    { label: '光锥预览图', missing: manifest.lightCones.previews.missing },
    { label: '光锥立绘', missing: manifest.lightCones.portraits.missing },
    { label: '遗器套装图标', missing: manifest.relics.icons.missing },
    { label: '遗器部件图标', missing: manifest.relics.pieces.missing },
    { label: '遗器属性图标', missing: manifest.relicProperties.icons.missing },
    { label: '属性图标', missing: manifest.elements.missing },
    { label: '命途图标', missing: manifest.paths.missing },
    { label: '导航图标', missing: manifest.navigation.icons.missing }
  ].filter((entry) => entry.missing.length > 0);
}

export function warnAssetFallback(manifest: VisualAssetManifest, context: string): void {
  const entries = assetFallbackEntries(manifest);
  if (!entries.length) return;
  console.warn(
    `视觉资源 fallback 已启用（${context}）：上游暂缺 ${entries.reduce((sum, entry) => sum + entry.missing.length, 0)} 项资源。`
  );
  for (const entry of entries) console.warn(`  ${entry.label}: ${entry.missing.join(', ')}`);
  console.warn('  仅缺失项使用无图降级；非法索引、损坏图片和转换错误仍会中止同步。');
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
    lightCones: {
      previews: unavailable(requirements.lightConeIds),
      portraits: unavailable(requirements.lightConeIds)
    },
    relics: {
      icons: unavailable(requirements.relicSetIds),
      pieces: unavailable(requirements.relicPieces.map((piece) => piece.id))
    },
    relicProperties: {
      icons: unavailable(
        uniqueSorted(requirements.relicPropertyIcons.map((entry) => entry.iconKey))
      )
    },
    elements: unavailable(requirements.elements),
    paths: unavailable(requirements.paths),
    navigation: { icons: unavailable(requirements.navigationIcons) }
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

export function assetOutputPaths(root = generatedAssetRoot): AssetOutputPaths {
  return {
    root,
    previews: path.join(root, 'characters', 'preview'),
    portraits: path.join(root, 'characters', 'portrait'),
    lightConePreviews: path.join(root, 'light-cones', 'preview'),
    lightConePortraits: path.join(root, 'light-cones', 'portrait'),
    relicIcons: path.join(root, 'relics', 'icons'),
    relicPieces: path.join(root, 'relics', 'pieces'),
    relicPropertyIcons: path.join(root, 'relic-properties'),
    elements: path.join(root, 'elements'),
    paths: path.join(root, 'paths'),
    navigation: path.join(root, 'navigation')
  };
}

async function prepareOutputDirectories(output: AssetOutputPaths): Promise<void> {
  await rm(output.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  await Promise.all(
    [
      output.previews,
      output.portraits,
      output.lightConePreviews,
      output.lightConePortraits,
      output.relicIcons,
      output.relicPieces,
      output.relicPropertyIcons,
      output.elements,
      output.paths,
      output.navigation
    ].map((directory) => mkdir(directory, { recursive: true }))
  );
}

async function processRequested<TValue extends string>(
  requested: TValue[],
  sourcePath: (value: TValue) => string | undefined,
  outputPath: (value: TValue) => string,
  transform: (source: string, output: string) => Promise<void>
): Promise<AssetAvailability> {
  const available: string[] = [];
  const missing: string[] = [];
  for (const value of requested) {
    const source = sourcePath(value);
    if (!source) {
      missing.push(value);
      continue;
    }
    try {
      await stat(source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        missing.push(value);
        continue;
      }
      throw new Error(`无法读取视觉资源 ${value}：${source}`, { cause: error });
    }
    try {
      await transform(source, outputPath(value));
    } catch (error) {
      throw new Error(`无法生成视觉资源 ${value}：${source}`, { cause: error });
    }
    available.push(value);
  }
  return { available, missing };
}

interface CharacterResourceIndexEntry {
  preview?: unknown;
}

interface LightConeResourceIndexEntry {
  id?: unknown;
  preview?: unknown;
  portrait?: unknown;
}

interface RelicSetResourceIndexEntry {
  id?: unknown;
  icon?: unknown;
}

interface RelicResourceIndexEntry {
  id?: unknown;
  set_id?: unknown;
  type?: unknown;
  icon?: unknown;
}

interface PropertyResourceIndexEntry {
  type?: unknown;
  icon?: unknown;
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

function resolveOptionalIndexedAssetPath(
  sourceRoot: string,
  relativePath: unknown
): string | undefined {
  if (relativePath === null || relativePath === undefined) return undefined;
  return resolveIndexedAssetPath(sourceRoot, relativePath);
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
    const source = resolveOptionalIndexedAssetPath(sourceRoot, preview);
    if (!source) continue;
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    if (!/^image\/character_preview\/[^/]+\.png$/i.test(relative))
      throw new Error(`角色 ${id} 的 preview 路径不属于 character_preview：${relative}`);
    sources.set(id, source);
  }
  return sources;
}

export async function readLightConePreviewSources(
  sourceRoot: string,
  lightConeIds: string[]
): Promise<ReadonlyMap<string, string>> {
  const indexPath = path.join(sourceRoot, 'index_new', 'cn', 'light_cones.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<
    string,
    LightConeResourceIndexEntry
  >;
  if (!index || typeof index !== 'object' || Array.isArray(index))
    throw new Error(`StarRailRes 光锥 index 格式异常：${indexPath}`);
  const sources = new Map<string, string>();
  for (const id of lightConeIds) {
    const entry = index[id];
    if (!entry) continue;
    if (entry.id !== id) throw new Error(`光锥 ${id} 的 index identity 不一致：${entry.id}`);
    const source = resolveOptionalIndexedAssetPath(sourceRoot, entry.preview);
    if (!source) continue;
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    if (!/^image\/light_cone_preview\/[^/]+\.png$/i.test(relative))
      throw new Error(`光锥 ${id} 的 preview 路径不属于 light_cone_preview：${relative}`);
    sources.set(id, source);
  }
  return sources;
}

export async function readLightConePortraitSources(
  sourceRoot: string,
  lightConeIds: string[]
): Promise<ReadonlyMap<string, string>> {
  const indexPath = path.join(sourceRoot, 'index_new', 'cn', 'light_cones.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<
    string,
    LightConeResourceIndexEntry
  >;
  if (!index || typeof index !== 'object' || Array.isArray(index))
    throw new Error(`StarRailRes 光锥 index 格式异常：${indexPath}`);
  const sources = new Map<string, string>();
  for (const id of lightConeIds) {
    const entry = index[id];
    if (!entry) continue;
    if (entry.id !== id) throw new Error(`光锥 ${id} 的 index identity 不一致：${entry.id}`);
    const source = resolveOptionalIndexedAssetPath(sourceRoot, entry.portrait);
    if (!source) continue;
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    if (!/^image\/light_cone_portrait\/[^/]+\.png$/i.test(relative))
      throw new Error(`光锥 ${id} 的 portrait 路径不属于 light_cone_portrait：${relative}`);
    sources.set(id, source);
  }
  return sources;
}

export async function readRelicSetIconSources(
  sourceRoot: string,
  relicSetIds: string[]
): Promise<ReadonlyMap<string, string>> {
  const indexPath = path.join(sourceRoot, 'index_new', 'cn', 'relic_sets.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<
    string,
    RelicSetResourceIndexEntry
  >;
  if (!index || typeof index !== 'object' || Array.isArray(index))
    throw new Error(`StarRailRes 遗器套装 index 格式异常：${indexPath}`);
  const sources = new Map<string, string>();
  for (const id of relicSetIds) {
    const entry = index[id];
    if (!entry) continue;
    if (entry.id !== id) throw new Error(`遗器套装 ${id} 的 index identity 不一致：${entry.id}`);
    const source = resolveOptionalIndexedAssetPath(sourceRoot, entry.icon);
    if (!source) continue;
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    if (relative !== `icon/relic/${id}.png`)
      throw new Error(`遗器套装 ${id} 必须使用套装图标 XXX.png：${relative}`);
    sources.set(id, source);
  }
  return sources;
}

export async function readRelicPieceIconSources(
  sourceRoot: string,
  pieces: AssetRequirements['relicPieces']
): Promise<ReadonlyMap<string, string>> {
  const indexPath = path.join(sourceRoot, 'index_new', 'cn', 'relics.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<
    string,
    RelicResourceIndexEntry
  >;
  if (!index || typeof index !== 'object' || Array.isArray(index))
    throw new Error(`StarRailRes 遗器 index 格式异常：${indexPath}`);
  const sources = new Map<string, string>();
  for (const piece of pieces) {
    const entry = index[piece.id];
    if (!entry) continue;
    if (entry.id !== piece.id)
      throw new Error(`遗器部件 ${piece.id} 的 index identity 不一致：${entry.id}`);
    if (String(entry.set_id) !== piece.setId || entry.type !== piece.slot)
      throw new Error(`遗器部件 ${piece.id} 的套装或槽位不一致：${entry.set_id}/${entry.type}`);
    const source = resolveOptionalIndexedAssetPath(sourceRoot, entry.icon);
    if (!source) continue;
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    if (!/^icon\/relic\/[^/]+\.png$/i.test(relative))
      throw new Error(`遗器部件 ${piece.id} 的图标路径不属于 icon/relic：${relative}`);
    sources.set(piece.id, source);
  }
  return sources;
}

export async function readRelicPropertyIconSources(
  sourceRoot: string,
  properties: AssetRequirements['relicPropertyIcons']
): Promise<ReadonlyMap<string, string>> {
  const indexPath = path.join(sourceRoot, 'index_new', 'cn', 'properties.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<
    string,
    PropertyResourceIndexEntry
  >;
  if (!index || typeof index !== 'object' || Array.isArray(index))
    throw new Error(`StarRailRes 属性 index 格式异常：${indexPath}`);
  const sources = new Map<string, string>();
  for (const property of properties) {
    const entry = index[property.propertyType];
    if (!entry) continue;
    if (entry.type !== property.propertyType)
      throw new Error(`遗器属性 ${property.propertyType} 的 index identity 不一致：${entry.type}`);
    const source = resolveOptionalIndexedAssetPath(sourceRoot, entry.icon);
    if (!source) continue;
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    if (relative !== `icon/property/${property.iconKey}.png`)
      throw new Error(`遗器属性 ${property.propertyType} 的图标映射不一致：${relative}`);
    const existing = sources.get(property.iconKey);
    if (existing && existing !== source)
      throw new Error(`遗器属性图标 key ${property.iconKey} 映射到多个来源`);
    sources.set(property.iconKey, source);
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

export async function writeNavigationIconAsset(source: string, output: string): Promise<void> {
  await sharp(source)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(64, 64, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(output);
}

export async function generateLightConePortraitAssets(
  sourceRoot: string,
  lightConeIds: string[],
  outputRoot = generatedLightConePortraitRoot
): Promise<AssetAvailability> {
  const sources = await readLightConePortraitSources(sourceRoot, lightConeIds);
  await mkdir(outputRoot, { recursive: true });
  return processRequested(
    lightConeIds,
    (id) => sources.get(id),
    (id) => path.join(outputRoot, `${id}.webp`),
    writePortraitAsset
  );
}

export async function generateVisualAssets(
  sourceRoot: string,
  requirements: AssetRequirements,
  outputRoot = generatedAssetRoot
): Promise<Omit<VisualAssetManifest, 'schemaVersion' | 'sourceCommit' | 'generatedAt'>> {
  // Validate every index before touching output so malformed upstream data cannot erase a cache.
  const previewSources = await readCharacterPreviewSources(sourceRoot, requirements.characterIds);
  const lightConePreviewSources = await readLightConePreviewSources(
    sourceRoot,
    requirements.lightConeIds
  );
  const lightConePortraitSources = await readLightConePortraitSources(
    sourceRoot,
    requirements.lightConeIds
  );
  const relicSetIconSources = await readRelicSetIconSources(sourceRoot, requirements.relicSetIds);
  const relicPieceIconSources = await readRelicPieceIconSources(
    sourceRoot,
    requirements.relicPieces
  );
  const relicPropertyIconSources = await readRelicPropertyIconSources(
    sourceRoot,
    requirements.relicPropertyIcons
  );
  const output = assetOutputPaths(outputRoot);
  await prepareOutputDirectories(output);
  const previews = await processRequested(
    requirements.characterIds,
    (id) => previewSources.get(id),
    (id) => path.join(output.previews, `${id}.png`),
    async (source, output) => copyFile(source, output)
  );
  const portraits = await processRequested(
    requirements.characterIds,
    (id) => path.join(sourceRoot, 'image', 'character_portrait', `${id}.png`),
    (id) => path.join(output.portraits, `${id}.webp`),
    writePortraitAsset
  );
  const lightConePreviews = await processRequested(
    requirements.lightConeIds,
    (id) => lightConePreviewSources.get(id),
    (id) => path.join(output.lightConePreviews, `${id}.png`),
    async (source, output) => copyFile(source, output)
  );
  const lightConePortraits = await processRequested(
    requirements.lightConeIds,
    (id) => lightConePortraitSources.get(id),
    (id) => path.join(output.lightConePortraits, `${id}.webp`),
    writePortraitAsset
  );
  const relicIcons = await processRequested(
    requirements.relicSetIds,
    (id) => relicSetIconSources.get(id),
    (id) => path.join(output.relicIcons, `${id}.png`),
    async (source, output) => copyFile(source, output)
  );
  const relicPieces = await processRequested(
    requirements.relicPieces.map((piece) => piece.id),
    (id) => relicPieceIconSources.get(id),
    (id) => path.join(output.relicPieces, `${id}.png`),
    async (source, output) => copyFile(source, output)
  );
  const relicPropertyIconKeys = uniqueSorted(
    requirements.relicPropertyIcons.map((entry) => entry.iconKey)
  );
  const relicPropertyIcons = await processRequested(
    relicPropertyIconKeys,
    (iconKey) => relicPropertyIconSources.get(iconKey),
    (iconKey) => path.join(output.relicPropertyIcons, `${iconKey}.png`),
    async (source, output) => copyFile(source, output)
  );
  const elements = await processRequested(
    requirements.elements,
    (code) => path.join(sourceRoot, 'icon', 'element', `${ELEMENT_SOURCE_NAMES[code]}.png`),
    (code) => path.join(output.elements, `${code}.png`),
    writeSemanticIconAsset
  );
  const paths = await processRequested(
    requirements.paths,
    (code) => path.join(sourceRoot, 'icon', 'path', `${PATH_SOURCE_NAMES[code]}.png`),
    (code) => path.join(output.paths, `${code}.png`),
    writeSemanticIconAsset
  );
  const navigationIcons = await processRequested(
    requirements.navigationIcons,
    (iconKey) =>
      path.join(sourceRoot, 'icon', 'sign', `${NAVIGATION_ICON_SOURCE_NAMES[iconKey]}.png`),
    (iconKey) => path.join(output.navigation, `${iconKey}.png`),
    writeNavigationIconAsset
  );
  return {
    characters: { previews, portraits },
    lightCones: { previews: lightConePreviews, portraits: lightConePortraits },
    relics: { icons: relicIcons, pieces: relicPieces },
    relicProperties: { icons: relicPropertyIcons },
    elements,
    paths,
    navigation: { icons: navigationIcons }
  };
}

const collectionCovers = (collection: AssetAvailability, required: string[]): boolean => {
  const recorded = [...collection.available, ...collection.missing].sort((a, b) =>
    a.localeCompare(b)
  );
  const expected = [...required].sort((a, b) => a.localeCompare(b));
  return (
    recorded.length === expected.length &&
    recorded.every((value, index) => value === expected[index])
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
    collectionCovers(manifest.lightCones.previews, requirements.lightConeIds) &&
    collectionCovers(manifest.lightCones.portraits, requirements.lightConeIds) &&
    collectionCovers(manifest.relics.icons, requirements.relicSetIds) &&
    collectionCovers(
      manifest.relics.pieces,
      requirements.relicPieces.map((piece) => piece.id)
    ) &&
    collectionCovers(
      manifest.relicProperties.icons,
      uniqueSorted(requirements.relicPropertyIcons.map((entry) => entry.iconKey))
    ) &&
    collectionCovers(manifest.elements, requirements.elements) &&
    collectionCovers(manifest.paths, requirements.paths) &&
    collectionCovers(manifest.navigation.icons, requirements.navigationIcons)
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

const expectedFiles = (
  manifest: VisualAssetManifest,
  output = assetOutputPaths()
): Array<[string, string[]]> => [
  [output.previews, manifest.characters.previews.available.map((id) => `${id}.png`)],
  [output.portraits, manifest.characters.portraits.available.map((id) => `${id}.webp`)],
  [output.lightConePreviews, manifest.lightCones.previews.available.map((id) => `${id}.png`)],
  [output.lightConePortraits, manifest.lightCones.portraits.available.map((id) => `${id}.webp`)],
  [output.relicIcons, manifest.relics.icons.available.map((id) => `${id}.png`)],
  [output.relicPieces, manifest.relics.pieces.available.map((id) => `${id}.png`)],
  [
    output.relicPropertyIcons,
    manifest.relicProperties.icons.available.map((iconKey) => `${iconKey}.png`)
  ],
  [output.elements, manifest.elements.available.map((code) => `${code}.png`)],
  [output.paths, manifest.paths.available.map((code) => `${code}.png`)],
  [output.navigation, manifest.navigation.icons.available.map((iconKey) => `${iconKey}.png`)]
];

export async function manifestFilesExist(
  manifest: VisualAssetManifest,
  outputRoot = generatedAssetRoot
): Promise<boolean> {
  try {
    for (const [directory, requiredFiles] of expectedFiles(
      manifest,
      assetOutputPaths(outputRoot)
    )) {
      const files = new Set(await readdir(directory));
      if (!requiredFiles.every((file) => files.has(file))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function validateGeneratedAssetFiles(
  manifest: VisualAssetManifest,
  outputRoot = generatedAssetRoot
): Promise<void> {
  const output = assetOutputPaths(outputRoot);
  if (!(await manifestFilesExist(manifest, outputRoot)))
    throw new Error('视觉资源 manifest 与生成文件不一致。');
  for (const id of manifest.characters.previews.available) {
    const metadata = await sharp(path.join(output.previews, `${id}.png`)).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height)
      throw new Error(`生成角色预览图格式或尺寸异常：${id}`);
  }
  for (const id of manifest.characters.portraits.available) {
    const metadata = await sharp(path.join(output.portraits, `${id}.webp`)).metadata();
    if (
      metadata.format !== 'webp' ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 960 ||
      metadata.height > 960
    )
      throw new Error(`生成立绘格式或尺寸异常：${id}`);
  }
  for (const id of manifest.lightCones.previews.available) {
    const metadata = await sharp(path.join(output.lightConePreviews, `${id}.png`)).metadata();
    if (metadata.format !== 'png' || metadata.width !== 348 || metadata.height !== 408)
      throw new Error(`生成光锥预览图格式或尺寸异常：${id}`);
  }
  for (const id of manifest.lightCones.portraits.available) {
    const metadata = await sharp(path.join(output.lightConePortraits, `${id}.webp`)).metadata();
    if (
      metadata.format !== 'webp' ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 960 ||
      metadata.height > 960
    )
      throw new Error(`生成光锥立绘格式或尺寸异常：${id}`);
  }
  for (const id of manifest.relics.icons.available) {
    const metadata = await sharp(path.join(output.relicIcons, `${id}.png`)).metadata();
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器套装图标格式或尺寸异常：${id}`);
  }
  for (const id of manifest.relics.pieces.available) {
    const metadata = await sharp(path.join(output.relicPieces, `${id}.png`)).metadata();
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器部件图标格式或尺寸异常：${id}`);
  }
  for (const iconKey of manifest.relicProperties.icons.available) {
    const metadata = await sharp(path.join(output.relicPropertyIcons, `${iconKey}.png`)).metadata();
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器属性图标格式或尺寸异常：${iconKey}`);
  }
  for (const code of manifest.elements.available) {
    const metadata = await sharp(path.join(output.elements, `${code}.png`)).metadata();
    if (metadata.width !== 64 || metadata.height !== 64)
      throw new Error(`属性图标尺寸异常：${code}`);
  }
  for (const code of manifest.paths.available) {
    const metadata = await sharp(path.join(output.paths, `${code}.png`)).metadata();
    if (metadata.width !== 64 || metadata.height !== 64)
      throw new Error(`命途图标尺寸异常：${code}`);
  }
  for (const iconKey of manifest.navigation.icons.available) {
    const metadata = await sharp(path.join(output.navigation, `${iconKey}.png`)).metadata();
    if (
      metadata.format !== 'png' ||
      metadata.width !== 64 ||
      metadata.height !== 64 ||
      !metadata.hasAlpha
    )
      throw new Error(`导航图标格式或尺寸异常：${iconKey}`);
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
  const [
    previews,
    portraits,
    lightConePreviews,
    lightConePortraits,
    relicIcons,
    relicPieces,
    relicPropertyIcons,
    elements,
    paths,
    navigation
  ] = await Promise.all([
    directorySize(generatedPreviewRoot),
    directorySize(generatedPortraitRoot),
    directorySize(generatedLightConePreviewRoot),
    directorySize(generatedLightConePortraitRoot),
    directorySize(generatedRelicIconRoot),
    directorySize(generatedRelicPieceRoot),
    directorySize(generatedRelicPropertyRoot),
    directorySize(generatedElementRoot),
    directorySize(generatedPathRoot),
    directorySize(generatedNavigationRoot)
  ]);
  return {
    previews,
    portraits,
    lightConePreviews,
    lightConePortraits,
    relicIcons,
    relicPieces,
    relicPropertyIcons,
    elements,
    paths,
    navigation,
    total:
      previews +
      portraits +
      lightConePreviews +
      lightConePortraits +
      relicIcons +
      relicPieces +
      relicPropertyIcons +
      elements +
      paths +
      navigation
  };
}
