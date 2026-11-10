import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ENEMY_ASSET_DIRECTORY,
  ENEMY_ASSET_RESOURCE_TYPE,
  ENEMY_ASSET_SCHEMA_VERSION,
  ENEMY_FIGURE_DIRECTORY,
  enemyFigureFileName,
  enemyFigureUrl
} from '../domain/enemy-asset-paths.js';

interface EnemyAssetEntry {
  name: string;
  imageId: string;
  figure: string;
}

interface EnemyAssetManifest {
  schemaVersion: typeof ENEMY_ASSET_SCHEMA_VERSION;
  resourceType: typeof ENEMY_ASSET_RESOURCE_TYPE;
  monsters: Record<string, EnemyAssetEntry>;
}

interface EnemyAssetLoadOptions {
  manifestPath?: string;
  staticRoot?: string;
  warn?: (message: string) => void;
}

const defaultStaticRoot = path.resolve('static');

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function parseManifest(value: unknown): EnemyAssetManifest {
  const manifest = recordOf(value);
  if (
    !manifest ||
    manifest.schemaVersion !== ENEMY_ASSET_SCHEMA_VERSION ||
    manifest.resourceType !== ENEMY_ASSET_RESOURCE_TYPE ||
    !recordOf(manifest.monsters)
  )
    throw new Error('敌人资源 manifest 的 schema 或资源类型不匹配');
  return manifest as unknown as EnemyAssetManifest;
}

export async function loadEnemyPortraitMap(
  options: EnemyAssetLoadOptions = {}
): Promise<ReadonlyMap<number, string>> {
  const staticRoot = path.resolve(options.staticRoot ?? defaultStaticRoot);
  const assetRoot = path.join(staticRoot, ENEMY_ASSET_DIRECTORY);
  const figureRoot = path.join(assetRoot, ENEMY_FIGURE_DIRECTORY);
  const manifestPath = path.resolve(options.manifestPath ?? path.join(assetRoot, 'index.json'));
  const warn = options.warn ?? console.warn;
  try {
    const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    const portraits = new Map<number, string>();
    let invalid = 0;
    for (const [templateId, entry] of Object.entries(manifest.monsters)) {
      const numericId = Number(templateId);
      if (
        !Number.isSafeInteger(numericId) ||
        numericId <= 0 ||
        typeof entry?.imageId !== 'string' ||
        !/^(0|[1-9]\d*)$/.test(entry.imageId) ||
        entry.figure !== enemyFigureUrl(entry.imageId)
      ) {
        invalid += 1;
        continue;
      }
      try {
        await access(path.join(figureRoot, enemyFigureFileName(entry.imageId)));
        portraits.set(numericId, entry.figure);
      } catch {
        invalid += 1;
      }
    }
    if (invalid) warn(`敌人资源中有 ${invalid} 条映射无效或缺少本地文件，已使用无图降级。`);
    return portraits;
  } catch (error) {
    warn(`敌人立绘不可用，继续使用无图降级：${(error as Error).message}`);
    return new Map();
  }
}

let portraitMapPromise: Promise<ReadonlyMap<number, string>> | undefined;

function getPortraitMap(): Promise<ReadonlyMap<number, string>> {
  portraitMapPromise ??= loadEnemyPortraitMap();
  return portraitMapPromise;
}

export function getEnemyPortraitMap(): Promise<ReadonlyMap<number, string>> {
  return getPortraitMap();
}

export async function getEnemyPortraitUrl(templateId: number): Promise<string | undefined> {
  return (await getPortraitMap()).get(templateId);
}
