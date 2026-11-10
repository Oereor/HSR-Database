import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  ENEMY_ASSET_DIRECTORY,
  ENEMY_ASSET_SCHEMA_VERSION,
  ENEMY_IMAGE_DIRECTORIES,
  enemyImageFileName,
  enemyImageUrl,
  type EnemyImageType
} from '../domain/enemy-asset-paths.js';

interface EnemyAssetLoadOptions {
  manifestPath?: string;
  staticRoot?: string;
  warn?: (message: string) => void;
}

interface EnemyImageMaps {
  cards: ReadonlyMap<number, string>;
  heroes: ReadonlyMap<number, string>;
}

const defaultStaticRoot = path.resolve('static');

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export async function loadEnemyImageMaps(
  options: EnemyAssetLoadOptions = {}
): Promise<EnemyImageMaps> {
  const assetRoot = path.resolve(options.staticRoot ?? defaultStaticRoot, ENEMY_ASSET_DIRECTORY);
  const manifestPath = options.manifestPath ?? path.join(assetRoot, 'index.json');
  const warn = options.warn ?? console.warn;
  const cards = new Map<number, string>();
  const heroes = new Map<number, string>();
  try {
    const manifest = recordOf(JSON.parse(await readFile(manifestPath, 'utf8')));
    const monsters = recordOf(manifest?.monsters);
    const images = recordOf(manifest?.images);
    if (manifest?.schemaVersion !== ENEMY_ASSET_SCHEMA_VERSION || !monsters || !images)
      throw new Error('敌人资源 manifest 的 schema 不匹配');

    let invalid = 0;
    async function availableUrls(type: EnemyImageType, inventory: unknown) {
      const urls = new Map<string, string>();
      for (const [id, digest] of Object.entries(recordOf(inventory) ?? {})) {
        if (digest === null) continue;
        if (!/^(0|[1-9]\d*)$/.test(id) || !recordOf(digest)) {
          invalid += 1;
          continue;
        }
        const file = path.join(assetRoot, ENEMY_IMAGE_DIRECTORIES[type], enemyImageFileName(id));
        const fileStat = await stat(file).catch(() => undefined);
        if (fileStat?.isFile()) urls.set(id, enemyImageUrl(type, id));
        else invalid += 1;
      }
      return urls;
    }
    const [icons, figures] = await Promise.all([
      availableUrls('MonsterMiddleIcon', images.MonsterMiddleIcon),
      availableUrls('MonsterFigure', images.MonsterFigure)
    ]);
    for (const [templateId, entry] of Object.entries(monsters)) {
      const numericId = Number(templateId);
      const imageId = recordOf(entry)?.imageId;
      if (!Number.isSafeInteger(numericId) || numericId <= 0 || typeof imageId !== 'string') {
        invalid += 1;
        continue;
      }
      const icon = icons.get(imageId);
      const hero = figures.get(imageId) ?? icon;
      if (icon) cards.set(numericId, icon);
      if (hero) heroes.set(numericId, hero);
    }
    if (invalid) warn(`敌人资源中有 ${invalid} 条记录无效或缺少本地文件，已应用图片降级。`);
  } catch (error) {
    warn(`敌人图片不可用，继续使用无图降级：${(error as Error).message}`);
  }
  return { cards, heroes };
}

let imageMapsPromise: Promise<EnemyImageMaps> | undefined;

function getImageMaps(): Promise<EnemyImageMaps> {
  imageMapsPromise ??= loadEnemyImageMaps();
  return imageMapsPromise;
}

export async function getEnemyCardImageMap(): Promise<ReadonlyMap<number, string>> {
  return (await getImageMaps()).cards;
}

export async function getEnemyCardImageUrl(templateId: number): Promise<string | undefined> {
  return (await getEnemyCardImageMap()).get(templateId);
}

export async function getEnemyHeroImageUrl(templateId: number): Promise<string | undefined> {
  return (await getImageMaps()).heroes.get(templateId);
}
