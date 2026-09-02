import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

interface EnemyAssetEntry {
  name: string;
  imageId: string;
  icon: string;
}

interface EnemyAssetManifest {
  schemaVersion: 1 | 2;
  resourceType: 'MonsterMiddleIcon';
  monsters: Record<string, EnemyAssetEntry>;
}

interface EnemyAssetLoadOptions {
  manifestPath?: string;
  staticRoot?: string;
  warn?: (message: string) => void;
}

const defaultStaticRoot = path.resolve('static');
const defaultManifestPath = path.join(defaultStaticRoot, 'generated-enemy-assets', 'index.json');
const PORTRAIT_URL = /^\/generated-enemy-assets\/icons\/Monster_(\d+)\.webp$/;

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function parseManifest(value: unknown): EnemyAssetManifest {
  const manifest = recordOf(value);
  if (
    !manifest ||
    ![1, 2].includes(manifest.schemaVersion as number) ||
    manifest.resourceType !== 'MonsterMiddleIcon' ||
    !recordOf(manifest.monsters)
  )
    throw new Error('敌人资源 manifest 的 schema 或资源类型不匹配');
  return manifest as unknown as EnemyAssetManifest;
}

export async function loadEnemyPortraitMap(
  options: EnemyAssetLoadOptions = {}
): Promise<ReadonlyMap<number, string>> {
  const staticRoot = path.resolve(options.staticRoot ?? defaultStaticRoot);
  const iconRoot = path.resolve(staticRoot, 'generated-enemy-assets', 'icons');
  const manifestPath = path.resolve(options.manifestPath ?? defaultManifestPath);
  const warn = options.warn ?? console.warn;
  try {
    const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    const portraits = new Map<number, string>();
    let invalid = 0;
    for (const [templateId, entry] of Object.entries(manifest.monsters)) {
      const numericId = Number(templateId);
      const iconMatch = PORTRAIT_URL.exec(entry?.icon);
      if (
        !Number.isSafeInteger(numericId) ||
        numericId <= 0 ||
        typeof entry?.imageId !== 'string' ||
        !iconMatch ||
        iconMatch[1] !== entry.imageId
      ) {
        invalid += 1;
        continue;
      }
      const file = path.resolve(staticRoot, entry.icon.slice(1));
      if (!file.startsWith(`${iconRoot}${path.sep}`)) {
        invalid += 1;
        continue;
      }
      try {
        await access(file);
        portraits.set(numericId, entry.icon);
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
