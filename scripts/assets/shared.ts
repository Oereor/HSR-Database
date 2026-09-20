import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import type {
  CatalogEntry,
  Character,
  RelicCatalogEntry,
  RelicProperty,
  RelicSet,
  RelicSlot
} from '../../src/lib/domain/types.js';
import {
  BRAND_ICON_KEYS,
  UTILITY_ICON_KEYS,
  type AssetAvailability,
  type AssetResolutionMap,
  type BrandIconKey,
  type UtilityIconKey,
  type VisualAssetManifest
} from '../../src/lib/domain/visual-assets.js';
import {
  parseCharacterDetailIconKey,
  type CharacterDetailIconKey
} from '../../src/lib/domain/character-detail-icons.js';
import {
  ENDGAME_MODES,
  ENDGAME_MODE_META,
  type EndgameModeIconKey
} from '../../src/lib/domain/endgame-view.js';
import { NAVIGATION_ICON_KEYS, type NavigationIconKey } from '../../src/lib/navigation.js';
import { assertDataRoot, generatedRoot } from '../data/paths.js';
import {
  assetManifestPath,
  assetManifestRoot,
  assertAssetOutputPaths,
  generatedAssetRoot,
  generatedLightConePortraitRoot
} from './paths.js';
import { AssetFilesystemObservation, observeAssetFilesystem } from './observation.js';
import { createBoundedPoolState, runBoundedPool, throwBoundedPoolFailures } from './pool.js';

// Windows may otherwise retain recently inspected files in libvips' cache during rollback cleanup.
sharp.cache(false);

export const VISUAL_ASSET_SCHEMA_VERSION = 16 as const;

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
  player: 'FriendIcon',
  characters: 'AvatarIcon',
  'light-cones': 'ShopLightConIcon',
  relics: 'InventoryFosterIcon',
  enemies: 'IconActivityTreasureTrotter',
  endgame: 'AbyssIcon01'
};

export const BRAND_ICON_SOURCE_NAMES: Readonly<Record<BrandIconKey, string>> = {
  'train-party': 'TrainPartyIcon'
};

export const UTILITY_ICON_SOURCE_NAMES: Readonly<Record<UtilityIconKey, string>> = {
  changelog: 'SettingsPushIcon',
  settings: 'SettingsIcon'
};

const PLAYER_STAT_PROPERTY_ICONS = [
  { propertyType: 'ElationDamageAddedRatioBase', iconKey: 'IconJoy' }
] as const;

export interface AssetRequirements {
  characterIds: string[];
  playerAvatars: PlayerAvatarRequirement[];
  characterDetailIconKeys: CharacterDetailIconKey[];
  lightConeIds: string[];
  relicSetIds: string[];
  relicPieces: Array<{ id: string; setId: string; slot: RelicSlot }>;
  relicPropertyIcons: Array<{ propertyType: string; iconKey: string }>;
  elements: string[];
  paths: string[];
  navigationIcons: NavigationIconKey[];
  brandIcons: BrandIconKey[];
  utilityIcons: UtilityIconKey[];
  endgameModeIcons: EndgameModeIconKey[];
}

export interface PlayerAvatarRequirement {
  id: string;
  sourceFileName: string;
}

export interface AssetOutputPaths {
  root: string;
  previews: string;
  portraits: string;
  playerAvatars: string;
  characterDetailIcons: string;
  characterDetailSkillIcons: string;
  characterDetailPropertyIcons: string;
  lightConePreviews: string;
  lightConePortraits: string;
  relicIcons: string;
  relicPieces: string;
  relicPropertyIcons: string;
  elements: string;
  paths: string;
  navigation: string;
  branding: string;
  utility: string;
  endgameModeIcons: string;
}

export const DEFAULT_ASSET_COPY_CONCURRENCY = 1;
export const DEFAULT_ASSET_SHARP_CONCURRENCY = 2;
export const DEFAULT_ASSET_POOL_OVERLAP = false;

export interface AssetGenerationOptions {
  copyConcurrency?: number;
  sharpConcurrency?: number;
  overlapPools?: boolean;
}

export interface AssetGenerationStats {
  copyOperations: number;
  sharpOperations: number;
  missing: number;
  copyConcurrency: number;
  sharpConcurrency: number;
  overlapPools: boolean;
}

export interface GeneratedVisualAssets {
  assets: Omit<VisualAssetManifest, 'schemaVersion' | 'sourceCommit' | 'generatedAt'>;
  stats: AssetGenerationStats;
}

export interface AssetFallbackEntry {
  label: string;
  missing: string[];
}

/** Stable cache key for the complete, normalized asset requirement set. */
export function assetRequirementsFingerprint(requirements: AssetRequirements): string {
  const canonical = {
    characterIds: [...requirements.characterIds].sort(),
    playerAvatars: [...requirements.playerAvatars].sort((a, b) => a.id.localeCompare(b.id)),
    characterDetailIconKeys: [...requirements.characterDetailIconKeys].sort(),
    lightConeIds: [...requirements.lightConeIds].sort(),
    relicSetIds: [...requirements.relicSetIds].sort(),
    relicPieces: [...requirements.relicPieces]
      .map((piece) => ({ id: piece.id, setId: piece.setId, slot: piece.slot }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    relicPropertyIcons: [...requirements.relicPropertyIcons]
      .map((entry) => ({ propertyType: entry.propertyType, iconKey: entry.iconKey }))
      .sort((a, b) =>
        `${a.propertyType}:${a.iconKey}`.localeCompare(`${b.propertyType}:${b.iconKey}`)
      ),
    elements: [...requirements.elements].sort(),
    paths: [...requirements.paths].sort(),
    navigationIcons: [...requirements.navigationIcons].sort(),
    brandIcons: [...requirements.brandIcons].sort(),
    utilityIcons: [...requirements.utilityIcons].sort(),
    endgameModeIcons: [...requirements.endgameModeIcons].sort()
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const uniqueSorted = (values: Array<string | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => !!value))].sort((a, b) =>
    a.localeCompare(b)
  );

export async function readPlayerAvatarRequirements(
  dataRoot = assertDataRoot()
): Promise<PlayerAvatarRequirement[]> {
  const sourcePath = path.join(dataRoot, 'ExcelOutput', 'AvatarPlayerIcon.json');
  const value = JSON.parse(await readFile(sourcePath, 'utf8')) as unknown;
  if (!Array.isArray(value)) throw new Error(`AvatarPlayerIcon 格式异常：${sourcePath}`);

  const ids = new Set<string>();
  const sourceFileNames = new Set<string>();
  const requirements: PlayerAvatarRequirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`AvatarPlayerIcon 包含非法记录：${sourcePath}`);
    const record = item as Record<string, unknown>;
    if (typeof record.ID !== 'number' || !Number.isSafeInteger(record.ID) || record.ID <= 0)
      throw new Error(`AvatarPlayerIcon 包含非法 ID：${String(record.ID)}`);
    if (typeof record.ImagePath !== 'string')
      throw new Error(`AvatarPlayerIcon ${String(record.ID)} 缺少 ImagePath`);
    const match = /^SpriteOutput\/AvatarRoundIcon\/Avatar\/([A-Za-z0-9_-]+\.png)$/.exec(
      record.ImagePath
    );
    if (!match)
      throw new Error(
        `AvatarPlayerIcon ${String(record.ID)} 的 ImagePath 不属于 AvatarRoundIcon：${record.ImagePath}`
      );
    const id = String(record.ID);
    const sourceFileName = match[1];
    if (ids.has(id) || sourceFileNames.has(sourceFileName))
      throw new Error(`AvatarPlayerIcon identity 重复：${id} / ${sourceFileName}`);
    ids.add(id);
    sourceFileNames.add(sourceFileName);
    requirements.push({ id, sourceFileName });
  }
  return requirements.sort((a, b) => a.id.localeCompare(b.id));
}

export async function readAssetRequirements(
  dataRoot = assertDataRoot()
): Promise<AssetRequirements> {
  const productRoot = path.join(generatedRoot, 'views', 'zh-CN');
  const characterCatalogPath = path.join(productRoot, 'catalogs', 'characters.json');
  const lightConeCatalogPath = path.join(productRoot, 'catalogs', 'light-cones.json');
  const relicCatalogPath = path.join(productRoot, 'catalogs', 'relics.json');
  const relicPropertyCatalogPath = path.join(productRoot, 'catalogs', 'relic-properties.json');
  let characterCatalog: CatalogEntry[];
  let characterDetails: Character[];
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
          await readFile(path.join(productRoot, 'details', 'relics', `${set.id}.json`), 'utf8')
        )
      )
    );
    characterDetails = await Promise.all(
      characterCatalog.map(async (character) =>
        JSON.parse(
          await readFile(
            path.join(productRoot, 'details', 'characters', `${character.id}.json`),
            'utf8'
          )
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
    playerAvatars: await readPlayerAvatarRequirements(dataRoot),
    characterDetailIconKeys: uniqueSorted(
      characterDetails.flatMap((character) => [
        ...Object.values(character.baseStats.iconKeys ?? {}),
        ...Object.values(character.profiles).flatMap((profile) =>
          profile
            ? [
                profile.energy.iconKey,
                ...profile.skillCards.map((card) => card.iconKey),
                ...profile.traces.map((trace) => trace.iconKey),
                ...profile.eidolons.map((eidolon) => eidolon.iconKey)
              ]
            : []
        )
      ])
    ) as CharacterDetailIconKey[],
    lightConeIds: uniqueSorted(lightConeCatalog.map((entry) => entry.id)),
    relicSetIds: uniqueSorted(relicCatalog.map((entry) => entry.id)),
    relicPieces: relicDetails
      .flatMap((set) =>
        set.pieces.map((piece) => ({ id: piece.id, setId: set.id, slot: piece.slot }))
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
    relicPropertyIcons: [
      ...relicProperties.flatMap((property) =>
        property.iconKey ? [{ propertyType: property.propertyType, iconKey: property.iconKey }] : []
      ),
      ...PLAYER_STAT_PROPERTY_ICONS
    ],
    elements: uniqueSorted(characterCatalog.map((entry) => entry.element)),
    paths: uniqueSorted([...characterCatalog, ...lightConeCatalog].map((entry) => entry.path)),
    navigationIcons: [...NAVIGATION_ICON_KEYS],
    brandIcons: [...BRAND_ICON_KEYS],
    utilityIcons: [...UTILITY_ICON_KEYS],
    endgameModeIcons: ENDGAME_MODES.map((mode) => ENDGAME_MODE_META[mode].iconKey)
  };
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
    { label: '玩家头像', missing: manifest.playerAvatars.missing },
    { label: '角色详情图标', missing: manifest.characterDetails.icons.missing },
    { label: '光锥预览图', missing: manifest.lightCones.previews.missing },
    { label: '光锥立绘', missing: manifest.lightCones.portraits.missing },
    { label: '遗器套装图标', missing: manifest.relics.icons.missing },
    { label: '遗器部件图标', missing: manifest.relics.pieces.missing },
    { label: '遗器属性图标', missing: manifest.relicProperties.icons.missing },
    { label: '属性图标', missing: manifest.elements.missing },
    { label: '命途图标', missing: manifest.paths.missing },
    { label: '导航图标', missing: manifest.navigation.icons.missing },
    { label: '品牌图标', missing: manifest.branding.icons.missing },
    { label: '工具图标', missing: manifest.utility.icons.missing },
    { label: '高难模式图标', missing: manifest.endgame.modeIcons.missing }
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
    requirementsFingerprint: assetRequirementsFingerprint(requirements),
    generatedAt: new Date().toISOString(),
    characters: {
      previews: unavailable(requirements.characterIds),
      portraits: unavailable(requirements.characterIds)
    },
    playerAvatars: unavailable(requirements.playerAvatars.map(({ id }) => id)),
    characterDetails: {
      icons: { resolved: {}, missing: requirements.characterDetailIconKeys }
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
    navigation: { icons: unavailable(requirements.navigationIcons) },
    branding: { icons: unavailable(requirements.brandIcons) },
    utility: { icons: unavailable(requirements.utilityIcons) },
    endgame: { modeIcons: unavailable(requirements.endgameModeIcons) }
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
    playerAvatars: path.join(root, 'player-avatars'),
    characterDetailIcons: path.join(root, 'character-details', 'icons'),
    characterDetailSkillIcons: path.join(root, 'character-details', 'icons', 'skill'),
    characterDetailPropertyIcons: path.join(root, 'character-details', 'icons', 'property'),
    lightConePreviews: path.join(root, 'light-cones', 'preview'),
    lightConePortraits: path.join(root, 'light-cones', 'portrait'),
    relicIcons: path.join(root, 'relics', 'icons'),
    relicPieces: path.join(root, 'relics', 'pieces'),
    relicPropertyIcons: path.join(root, 'relic-properties'),
    elements: path.join(root, 'elements'),
    paths: path.join(root, 'paths'),
    navigation: path.join(root, 'navigation'),
    branding: path.join(root, 'branding'),
    utility: path.join(root, 'utility'),
    endgameModeIcons: path.join(root, 'endgame', 'modes')
  };
}

async function prepareOutputDirectories(output: AssetOutputPaths): Promise<void> {
  await rm(output.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  await Promise.all(
    [
      output.previews,
      output.portraits,
      output.playerAvatars,
      output.characterDetailSkillIcons,
      output.characterDetailPropertyIcons,
      output.lightConePreviews,
      output.lightConePortraits,
      output.relicIcons,
      output.relicPieces,
      output.relicPropertyIcons,
      output.elements,
      output.paths,
      output.navigation,
      output.branding,
      output.utility,
      output.endgameModeIcons
    ].map((directory) => mkdir(directory, { recursive: true }))
  );
}

type AssetTaskKind = 'copy' | 'sharp';

interface AssetWorkItem {
  order: number;
  kind: AssetTaskKind;
  run: () => Promise<boolean>;
}

interface PlannedAvailability {
  tasks: AssetWorkItem[];
  result: () => AssetAvailability;
}

function planRequested<TValue extends string>(
  requested: TValue[],
  sourcePath: (value: TValue) => string | undefined,
  outputPath: (value: TValue) => string,
  kind: AssetTaskKind,
  transform: (source: string, output: string) => Promise<void>
): PlannedAvailability {
  const status = new Map<TValue, 'available' | 'missing'>();
  const tasks: AssetWorkItem[] = [];
  for (const value of requested) {
    const source = sourcePath(value);
    if (!source) {
      status.set(value, 'missing');
      continue;
    }
    tasks.push({
      order: 0,
      kind,
      run: async () => {
        try {
          await stat(source);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            status.set(value, 'missing');
            return false;
          }
          throw new Error(`无法读取视觉资源 ${value}：${source}`, { cause: error });
        }
        try {
          await transform(source, outputPath(value));
        } catch (error) {
          throw new Error(`无法生成视觉资源 ${value}：${source}`, { cause: error });
        }
        status.set(value, 'available');
        return true;
      }
    });
  }
  return {
    tasks,
    result: () => ({
      available: requested.filter((value) => status.get(value) === 'available'),
      missing: requested.filter((value) => status.get(value) === 'missing')
    })
  };
}

async function executeAssetTasks(
  tasks: AssetWorkItem[],
  options: AssetGenerationOptions = {}
): Promise<Omit<AssetGenerationStats, 'missing'>> {
  const copyConcurrency = options.copyConcurrency ?? DEFAULT_ASSET_COPY_CONCURRENCY;
  const sharpConcurrency = options.sharpConcurrency ?? DEFAULT_ASSET_SHARP_CONCURRENCY;
  const overlapPools = options.overlapPools ?? DEFAULT_ASSET_POOL_OVERLAP;
  tasks.forEach((task, index) => (task.order = index));
  const copyTasks = tasks.filter((task) => task.kind === 'copy');
  const sharpTasks = tasks.filter((task) => task.kind === 'sharp');
  const state = createBoundedPoolState();
  let copyOperations = 0;
  let sharpOperations = 0;
  const run = async (items: AssetWorkItem[], concurrency: number): Promise<void> => {
    await runBoundedPool(
      items,
      concurrency,
      async (task) => {
        if (await task.run()) {
          if (task.kind === 'copy') copyOperations += 1;
          else sharpOperations += 1;
        }
      },
      state,
      (task) => task.order
    );
  };
  if (overlapPools)
    await Promise.all([run(copyTasks, copyConcurrency), run(sharpTasks, sharpConcurrency)]);
  else {
    await run(copyTasks, copyConcurrency);
    if (!state.failed) await run(sharpTasks, sharpConcurrency);
  }
  throwBoundedPoolFailures(state);
  return { copyOperations, sharpOperations, copyConcurrency, sharpConcurrency, overlapPools };
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

interface CharacterDetailResourceIndexEntry {
  id?: unknown;
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

export async function readCharacterDetailIconSources(
  sourceRoot: string,
  iconKeys: CharacterDetailIconKey[]
): Promise<ReadonlyMap<CharacterDetailIconKey, string>> {
  if (!iconKeys.length) return new Map();
  const indexRoot = path.join(sourceRoot, 'index_new', 'cn');
  const [properties, skills, skillTrees, ranks] = (await Promise.all(
    ['properties', 'character_skills', 'character_skill_trees', 'character_ranks'].map(
      async (name) => JSON.parse(await readFile(path.join(indexRoot, `${name}.json`), 'utf8'))
    )
  )) as Array<Record<string, CharacterDetailResourceIndexEntry>>;
  const indexes = { property: properties, skill: skills, 'skill-tree': skillTrees, rank: ranks };
  for (const [name, index] of Object.entries(indexes))
    if (!index || typeof index !== 'object' || Array.isArray(index))
      throw new Error(`StarRailRes 角色详情 ${name} index 格式异常`);

  const sources = new Map<CharacterDetailIconKey, string>();
  for (const iconKey of iconKeys) {
    const parsed = parseCharacterDetailIconKey(iconKey);
    if (!parsed) throw new Error(`角色详情 icon key 非法：${iconKey}`);
    const entry = indexes[parsed.kind][parsed.identity];
    if (!entry) continue;
    const indexedIdentity = parsed.kind === 'property' ? entry.type : entry.id;
    if (indexedIdentity !== parsed.identity)
      throw new Error(
        `角色详情 icon ${iconKey} 的 index identity 不一致：${String(indexedIdentity)}`
      );
    const source = resolveOptionalIndexedAssetPath(sourceRoot, entry.icon);
    if (!source) continue;
    const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
    const expectedDirectory = parsed.kind === 'property' ? 'property' : 'skill';
    if (!new RegExp(`^icon/${expectedDirectory}/[A-Za-z0-9_-]+\\.png$`, 'i').test(relative))
      throw new Error(
        `角色详情 icon ${iconKey} 的路径不属于 icon/${expectedDirectory}：${relative}`
      );
    sources.set(iconKey, source);
  }
  return sources;
}

function characterDetailAssetLocation(
  sourceRoot: string,
  source: string,
  output: AssetOutputPaths
): { outputPath: string; publicUrl: string } {
  const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
  const match = /^icon\/(skill|property)\/([A-Za-z0-9_-]+\.png)$/i.exec(relative);
  if (!match) throw new Error(`角色详情 icon 来源路径异常：${relative}`);
  const [, kind, filename] = match;
  const outputDirectory =
    kind.toLowerCase() === 'property'
      ? output.characterDetailPropertyIcons
      : output.characterDetailSkillIcons;
  return {
    outputPath: path.join(outputDirectory, filename),
    publicUrl: `/generated-assets/character-details/icons/${kind.toLowerCase()}/${filename}`
  };
}

interface PlannedCharacterDetailIcons {
  tasks: AssetWorkItem[];
  result: () => AssetResolutionMap;
}

function planCharacterDetailIcons(
  sourceRoot: string,
  iconKeys: CharacterDetailIconKey[],
  output: AssetOutputPaths,
  sources: ReadonlyMap<CharacterDetailIconKey, string>
): PlannedCharacterDetailIcons {
  const status = new Map<CharacterDetailIconKey, 'available' | 'missing'>();
  const locationByKey = new Map<
    CharacterDetailIconKey,
    { outputPath: string; publicUrl: string }
  >();
  const keysBySource = new Map<string, CharacterDetailIconKey[]>();
  for (const iconKey of iconKeys) {
    const source = sources.get(iconKey);
    if (!source) {
      status.set(iconKey, 'missing');
      continue;
    }
    const location = characterDetailAssetLocation(sourceRoot, source, output);
    locationByKey.set(iconKey, location);
    keysBySource.set(source, [...(keysBySource.get(source) ?? []), iconKey]);
  }
  const tasks = [...keysBySource.entries()].map(([source, sourceKeys]) => ({
    order: 0,
    kind: 'sharp' as const,
    run: async (): Promise<boolean> => {
      try {
        await stat(source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          for (const iconKey of sourceKeys) status.set(iconKey, 'missing');
          return false;
        }
        throw new Error(`无法读取角色详情 icon ${sourceKeys[0]}：${source}`, { cause: error });
      }
      try {
        await writeSemanticIconAsset(source, locationByKey.get(sourceKeys[0])!.outputPath);
      } catch (error) {
        throw new Error(`无法生成角色详情 icon ${sourceKeys[0]}：${source}`, { cause: error });
      }
      for (const iconKey of sourceKeys) status.set(iconKey, 'available');
      return true;
    }
  }));
  return {
    tasks,
    result: () => ({
      resolved: Object.fromEntries(
        iconKeys.flatMap((iconKey) =>
          status.get(iconKey) === 'available'
            ? [[iconKey, locationByKey.get(iconKey)!.publicUrl] as const]
            : []
        )
      ),
      missing: iconKeys.filter((iconKey) => status.get(iconKey) === 'missing')
    })
  };
}

export async function generateCharacterDetailIcons(
  sourceRoot: string,
  iconKeys: CharacterDetailIconKey[],
  output: AssetOutputPaths,
  indexedSources?: ReadonlyMap<CharacterDetailIconKey, string>,
  options: AssetGenerationOptions = {}
): Promise<AssetResolutionMap> {
  const sources = indexedSources ?? (await readCharacterDetailIconSources(sourceRoot, iconKeys));
  const plan = planCharacterDetailIcons(sourceRoot, iconKeys, output, sources);
  await executeAssetTasks(plan.tasks, options);
  return plan.result();
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

export async function writeEndgameModeIconAsset(source: string, output: string): Promise<void> {
  await sharp(source)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(128, 128, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(output);
}

export async function generateLightConePortraitAssets(
  sourceRoot: string,
  lightConeIds: string[],
  outputRoot = generatedLightConePortraitRoot,
  options: AssetGenerationOptions = {}
): Promise<AssetAvailability> {
  const sources = await readLightConePortraitSources(sourceRoot, lightConeIds);
  await mkdir(outputRoot, { recursive: true });
  const plan = planRequested(
    lightConeIds,
    (id) => sources.get(id),
    (id) => path.join(outputRoot, `${id}.webp`),
    'sharp',
    writePortraitAsset
  );
  await executeAssetTasks(plan.tasks, options);
  return plan.result();
}

export async function generateVisualAssetsWithStats(
  sourceRoot: string,
  requirements: AssetRequirements,
  outputRoot = generatedAssetRoot,
  options: AssetGenerationOptions = {}
): Promise<GeneratedVisualAssets> {
  // Validate every index before touching output so malformed upstream data cannot erase a cache.
  const [
    previewSources,
    characterDetailIconSources,
    lightConePreviewSources,
    lightConePortraitSources,
    relicSetIconSources,
    relicPieceIconSources,
    relicPropertyIconSources
  ] = await Promise.all([
    readCharacterPreviewSources(sourceRoot, requirements.characterIds),
    readCharacterDetailIconSources(sourceRoot, requirements.characterDetailIconKeys),
    readLightConePreviewSources(sourceRoot, requirements.lightConeIds),
    readLightConePortraitSources(sourceRoot, requirements.lightConeIds),
    readRelicSetIconSources(sourceRoot, requirements.relicSetIds),
    readRelicPieceIconSources(sourceRoot, requirements.relicPieces),
    readRelicPropertyIconSources(sourceRoot, requirements.relicPropertyIcons)
  ]);
  const output = assetOutputPaths(outputRoot);
  await prepareOutputDirectories(output);
  const previews = planRequested(
    requirements.characterIds,
    (id) => previewSources.get(id),
    (id) => path.join(output.previews, `${id}.png`),
    'copy',
    async (source, output) => copyFile(source, output)
  );
  const portraits = planRequested(
    requirements.characterIds,
    (id) => path.join(sourceRoot, 'image', 'character_portrait', `${id}.png`),
    (id) => path.join(output.portraits, `${id}.webp`),
    'sharp',
    writePortraitAsset
  );
  const playerAvatarSources = new Map(
    requirements.playerAvatars.map(({ id, sourceFileName }) => [
      id,
      path.join(sourceRoot, 'icon', 'avatar', sourceFileName)
    ])
  );
  const playerAvatars = planRequested(
    requirements.playerAvatars.map(({ id }) => id),
    (id) => playerAvatarSources.get(id),
    (id) => path.join(output.playerAvatars, `${id}.png`),
    'copy',
    async (source, outputPath) => copyFile(source, outputPath)
  );
  const characterDetailIcons = planCharacterDetailIcons(
    sourceRoot,
    requirements.characterDetailIconKeys,
    output,
    characterDetailIconSources
  );
  const lightConePreviews = planRequested(
    requirements.lightConeIds,
    (id) => lightConePreviewSources.get(id),
    (id) => path.join(output.lightConePreviews, `${id}.png`),
    'copy',
    async (source, output) => copyFile(source, output)
  );
  const lightConePortraits = planRequested(
    requirements.lightConeIds,
    (id) => lightConePortraitSources.get(id),
    (id) => path.join(output.lightConePortraits, `${id}.webp`),
    'sharp',
    writePortraitAsset
  );
  const relicIcons = planRequested(
    requirements.relicSetIds,
    (id) => relicSetIconSources.get(id),
    (id) => path.join(output.relicIcons, `${id}.png`),
    'copy',
    async (source, output) => copyFile(source, output)
  );
  const relicPieces = planRequested(
    requirements.relicPieces.map((piece) => piece.id),
    (id) => relicPieceIconSources.get(id),
    (id) => path.join(output.relicPieces, `${id}.png`),
    'copy',
    async (source, output) => copyFile(source, output)
  );
  const relicPropertyIconKeys = uniqueSorted(
    requirements.relicPropertyIcons.map((entry) => entry.iconKey)
  );
  const relicPropertyIcons = planRequested(
    relicPropertyIconKeys,
    (iconKey) => relicPropertyIconSources.get(iconKey),
    (iconKey) => path.join(output.relicPropertyIcons, `${iconKey}.png`),
    'copy',
    async (source, output) => copyFile(source, output)
  );
  const elements = planRequested(
    requirements.elements,
    (code) => path.join(sourceRoot, 'icon', 'element', `${ELEMENT_SOURCE_NAMES[code]}.png`),
    (code) => path.join(output.elements, `${code}.png`),
    'sharp',
    writeSemanticIconAsset
  );
  const paths = planRequested(
    requirements.paths,
    (code) => path.join(sourceRoot, 'icon', 'path', `${PATH_SOURCE_NAMES[code]}.png`),
    (code) => path.join(output.paths, `${code}.png`),
    'sharp',
    writeSemanticIconAsset
  );
  const navigationIcons = planRequested(
    requirements.navigationIcons,
    (iconKey) =>
      path.join(sourceRoot, 'icon', 'sign', `${NAVIGATION_ICON_SOURCE_NAMES[iconKey]}.png`),
    (iconKey) => path.join(output.navigation, `${iconKey}.png`),
    'sharp',
    writeNavigationIconAsset
  );
  const brandingIcons = planRequested(
    requirements.brandIcons,
    (iconKey) => path.join(sourceRoot, 'icon', 'sign', `${BRAND_ICON_SOURCE_NAMES[iconKey]}.png`),
    (iconKey) => path.join(output.branding, `${iconKey}.png`),
    'copy',
    async (source, output) => copyFile(source, output)
  );
  const utilityIcons = planRequested(
    requirements.utilityIcons,
    (iconKey) => path.join(sourceRoot, 'icon', 'sign', `${UTILITY_ICON_SOURCE_NAMES[iconKey]}.png`),
    (iconKey) => path.join(output.utility, `${iconKey}.png`),
    'sharp',
    writeNavigationIconAsset
  );
  const endgameModeIcons = planRequested(
    requirements.endgameModeIcons,
    (iconKey) => path.join(sourceRoot, 'icon', 'sign', `${iconKey}.png`),
    (iconKey) => path.join(output.endgameModeIcons, `${iconKey}.png`),
    'sharp',
    writeEndgameModeIconAsset
  );
  const plans = [
    previews,
    portraits,
    playerAvatars,
    characterDetailIcons,
    lightConePreviews,
    lightConePortraits,
    relicIcons,
    relicPieces,
    relicPropertyIcons,
    elements,
    paths,
    navigationIcons,
    brandingIcons,
    utilityIcons,
    endgameModeIcons
  ];
  const taskStats = await executeAssetTasks(
    plans.flatMap((plan) => plan.tasks),
    options
  );
  const assets = {
    characters: { previews: previews.result(), portraits: portraits.result() },
    playerAvatars: playerAvatars.result(),
    characterDetails: { icons: characterDetailIcons.result() },
    lightCones: {
      previews: lightConePreviews.result(),
      portraits: lightConePortraits.result()
    },
    relics: { icons: relicIcons.result(), pieces: relicPieces.result() },
    relicProperties: { icons: relicPropertyIcons.result() },
    elements: elements.result(),
    paths: paths.result(),
    navigation: { icons: navigationIcons.result() },
    branding: { icons: brandingIcons.result() },
    utility: { icons: utilityIcons.result() },
    endgame: { modeIcons: endgameModeIcons.result() }
  };
  const missing = assetFallbackEntries({
    schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
    generatedAt: '',
    ...assets
  }).reduce((total, entry) => total + entry.missing.length, 0);
  return { assets, stats: { ...taskStats, missing } };
}

export async function generateVisualAssets(
  sourceRoot: string,
  requirements: AssetRequirements,
  outputRoot = generatedAssetRoot,
  options: AssetGenerationOptions = {}
): Promise<Omit<VisualAssetManifest, 'schemaVersion' | 'sourceCommit' | 'generatedAt'>> {
  return (await generateVisualAssetsWithStats(sourceRoot, requirements, outputRoot, options))
    .assets;
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

const resolutionCovers = (collection: AssetResolutionMap, required: string[]): boolean =>
  collectionCovers(
    { available: Object.keys(collection.resolved), missing: collection.missing },
    required
  );

export function manifestCoversRequirements(
  manifest: VisualAssetManifest,
  requirements: AssetRequirements
): boolean {
  return (
    manifest.schemaVersion === VISUAL_ASSET_SCHEMA_VERSION &&
    (!manifest.requirementsFingerprint ||
      manifest.requirementsFingerprint === assetRequirementsFingerprint(requirements)) &&
    collectionCovers(manifest.characters.previews, requirements.characterIds) &&
    collectionCovers(manifest.characters.portraits, requirements.characterIds) &&
    collectionCovers(
      manifest.playerAvatars,
      requirements.playerAvatars.map(({ id }) => id)
    ) &&
    resolutionCovers(manifest.characterDetails.icons, requirements.characterDetailIconKeys) &&
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
    collectionCovers(manifest.navigation.icons, requirements.navigationIcons) &&
    collectionCovers(manifest.branding.icons, requirements.brandIcons) &&
    collectionCovers(manifest.utility.icons, requirements.utilityIcons) &&
    collectionCovers(manifest.endgame.modeIcons, requirements.endgameModeIcons)
  );
}

const expectedFiles = (
  manifest: VisualAssetManifest,
  output = assetOutputPaths()
): Array<[string, string[]]> => [
  [output.previews, manifest.characters.previews.available.map((id) => `${id}.png`)],
  [output.portraits, manifest.characters.portraits.available.map((id) => `${id}.webp`)],
  [output.playerAvatars, manifest.playerAvatars.available.map((id) => `${id}.png`)],
  [
    output.characterDetailSkillIcons,
    uniqueSorted(
      Object.values(manifest.characterDetails.icons.resolved).flatMap((url) => {
        const match =
          /^\/generated-assets\/character-details\/icons\/skill\/([A-Za-z0-9_-]+\.png)$/.exec(url);
        return match ? [match[1]] : [];
      })
    )
  ],
  [
    output.characterDetailPropertyIcons,
    uniqueSorted(
      Object.values(manifest.characterDetails.icons.resolved).flatMap((url) => {
        const match =
          /^\/generated-assets\/character-details\/icons\/property\/([A-Za-z0-9_-]+\.png)$/.exec(
            url
          );
        return match ? [match[1]] : [];
      })
    )
  ],
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
  [output.navigation, manifest.navigation.icons.available.map((iconKey) => `${iconKey}.png`)],
  [output.branding, manifest.branding.icons.available.map((iconKey) => `${iconKey}.png`)],
  [output.utility, manifest.utility.icons.available.map((iconKey) => `${iconKey}.png`)],
  [output.endgameModeIcons, manifest.endgame.modeIcons.available.map((iconKey) => `${iconKey}.png`)]
];

const assetOutputDirectories = (output: AssetOutputPaths): string[] => [
  output.previews,
  output.portraits,
  output.playerAvatars,
  output.characterDetailSkillIcons,
  output.characterDetailPropertyIcons,
  output.lightConePreviews,
  output.lightConePortraits,
  output.relicIcons,
  output.relicPieces,
  output.relicPropertyIcons,
  output.elements,
  output.paths,
  output.navigation,
  output.branding,
  output.utility,
  output.endgameModeIcons
];

export async function observeGeneratedAssetFiles(
  outputRoot = generatedAssetRoot
): Promise<AssetFilesystemObservation> {
  const output = assetOutputPaths(outputRoot);
  return observeAssetFilesystem(outputRoot, assetOutputDirectories(output));
}

export async function manifestFilesExist(
  manifest: VisualAssetManifest,
  outputRoot = generatedAssetRoot,
  observation?: AssetFilesystemObservation
): Promise<boolean> {
  try {
    const actual = observation ?? (await observeGeneratedAssetFiles(outputRoot));
    if (actual.root !== path.resolve(outputRoot)) return false;
    for (const [directory, requiredFiles] of expectedFiles(
      manifest,
      assetOutputPaths(outputRoot)
    )) {
      const files = actual.fileNames(directory);
      if (!files) return false;
      if (!requiredFiles.every((file) => files.has(file))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function validateGeneratedAssetFiles(
  manifest: VisualAssetManifest,
  outputRoot = generatedAssetRoot,
  observation?: AssetFilesystemObservation
): Promise<AssetFilesystemObservation> {
  const output = assetOutputPaths(outputRoot);
  const actual = observation ?? (await observeGeneratedAssetFiles(outputRoot));
  if (!(await manifestFilesExist(manifest, outputRoot, actual)))
    throw new Error('视觉资源 manifest 与生成文件不一致。');
  for (const id of manifest.characters.previews.available) {
    const metadata = await actual.metadata(path.join(output.previews, `${id}.png`));
    if (metadata.format !== 'png' || !metadata.width || !metadata.height)
      throw new Error(`生成角色预览图格式或尺寸异常：${id}`);
  }
  for (const id of manifest.characters.portraits.available) {
    const metadata = await actual.metadata(path.join(output.portraits, `${id}.webp`));
    if (
      metadata.format !== 'webp' ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 960 ||
      metadata.height > 960
    )
      throw new Error(`生成立绘格式或尺寸异常：${id}`);
  }
  for (const id of manifest.playerAvatars.available) {
    const metadata = await actual.metadata(path.join(output.playerAvatars, `${id}.png`));
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`玩家头像格式或尺寸异常：${id}`);
  }
  for (const [iconKey, url] of Object.entries(manifest.characterDetails.icons.resolved)) {
    const parsedKey = parseCharacterDetailIconKey(iconKey);
    const match =
      /^\/generated-assets\/character-details\/icons\/(skill|property)\/([A-Za-z0-9_-]+\.png)$/.exec(
        url
      );
    if (!parsedKey || !match)
      throw new Error(`角色详情 icon manifest 映射异常：${iconKey} -> ${url}`);
    const expectedKind = parsedKey.kind === 'property' ? 'property' : 'skill';
    if (match[1] !== expectedKind)
      throw new Error(`角色详情 icon manifest 目录不一致：${iconKey} -> ${url}`);
    const iconPath = path.join(
      expectedKind === 'property'
        ? output.characterDetailPropertyIcons
        : output.characterDetailSkillIcons,
      match[2]
    );
    const metadata = await actual.metadata(iconPath);
    if (
      metadata.format !== 'png' ||
      metadata.width !== 64 ||
      metadata.height !== 64 ||
      !metadata.hasAlpha
    )
      throw new Error(`角色详情 icon 格式或尺寸异常：${iconKey}`);
  }
  for (const id of manifest.lightCones.previews.available) {
    const metadata = await actual.metadata(path.join(output.lightConePreviews, `${id}.png`));
    if (metadata.format !== 'png' || metadata.width !== 348 || metadata.height !== 408)
      throw new Error(`生成光锥预览图格式或尺寸异常：${id}`);
  }
  for (const id of manifest.lightCones.portraits.available) {
    const metadata = await actual.metadata(path.join(output.lightConePortraits, `${id}.webp`));
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
    const metadata = await actual.metadata(path.join(output.relicIcons, `${id}.png`));
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器套装图标格式或尺寸异常：${id}`);
  }
  for (const id of manifest.relics.pieces.available) {
    const metadata = await actual.metadata(path.join(output.relicPieces, `${id}.png`));
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器部件图标格式或尺寸异常：${id}`);
  }
  for (const iconKey of manifest.relicProperties.icons.available) {
    const metadata = await actual.metadata(path.join(output.relicPropertyIcons, `${iconKey}.png`));
    if (metadata.format !== 'png' || metadata.width !== 128 || metadata.height !== 128)
      throw new Error(`遗器属性图标格式或尺寸异常：${iconKey}`);
  }
  for (const code of manifest.elements.available) {
    const metadata = await actual.metadata(path.join(output.elements, `${code}.png`));
    if (metadata.width !== 64 || metadata.height !== 64)
      throw new Error(`属性图标尺寸异常：${code}`);
  }
  for (const code of manifest.paths.available) {
    const metadata = await actual.metadata(path.join(output.paths, `${code}.png`));
    if (metadata.width !== 64 || metadata.height !== 64)
      throw new Error(`命途图标尺寸异常：${code}`);
  }
  for (const iconKey of manifest.navigation.icons.available) {
    const metadata = await actual.metadata(path.join(output.navigation, `${iconKey}.png`));
    if (
      metadata.format !== 'png' ||
      metadata.width !== 64 ||
      metadata.height !== 64 ||
      !metadata.hasAlpha
    )
      throw new Error(`导航图标格式或尺寸异常：${iconKey}`);
  }
  for (const iconKey of manifest.branding.icons.available) {
    const metadata = await actual.metadata(path.join(output.branding, `${iconKey}.png`));
    if (
      metadata.format !== 'png' ||
      metadata.width !== 128 ||
      metadata.height !== 128 ||
      !metadata.hasAlpha
    )
      throw new Error(`品牌图标格式或尺寸异常：${iconKey}`);
  }
  for (const iconKey of manifest.utility.icons.available) {
    const metadata = await actual.metadata(path.join(output.utility, `${iconKey}.png`));
    if (
      metadata.format !== 'png' ||
      metadata.width !== 64 ||
      metadata.height !== 64 ||
      !metadata.hasAlpha
    )
      throw new Error(`工具图标格式或尺寸异常：${iconKey}`);
  }
  for (const iconKey of manifest.endgame.modeIcons.available) {
    const metadata = await actual.metadata(path.join(output.endgameModeIcons, `${iconKey}.png`));
    if (
      metadata.format !== 'png' ||
      metadata.width !== 128 ||
      metadata.height !== 128 ||
      !metadata.hasAlpha
    )
      throw new Error(`高难模式图标格式或尺寸异常：${iconKey}`);
  }
  return actual;
}
