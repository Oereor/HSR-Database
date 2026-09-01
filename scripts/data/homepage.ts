import type { CatalogEntry, HomepageRecentWarpData } from '../../src/lib/domain/types.js';

export const HOMEPAGE_RECENT_WARP_LIMIT = 6;

export interface HomepageGachaRow {
  GachaID?: unknown;
  GachaType?: unknown;
  PrefabPath?: unknown;
}

export function assertHomepageRecentWarpData(
  data: HomepageRecentWarpData,
  characterCatalog: CatalogEntry[],
  lightConeCatalog: CatalogEntry[]
): void {
  if (data.schemaVersion !== 1) throw new Error('Homepage 生成数据 schema 不受支持');

  const validateSelection = <T extends { gachaId: number }>(
    records: T[],
    entityIdOf: (record: T) => string,
    catalog: CatalogEntry[],
    label: string
  ) => {
    if (records.length !== HOMEPAGE_RECENT_WARP_LIMIT)
      throw new Error(`Homepage ${label}最近跃迁不是 ${HOMEPAGE_RECENT_WARP_LIMIT} 条`);
    const entities = new Map(catalog.map((entry) => [entry.id, entry]));
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!Number.isSafeInteger(record.gachaId) || record.gachaId <= 0)
        throw new Error(`Homepage ${label}最近跃迁包含无效 GachaID`);
      if (index > 0 && records[index - 1].gachaId <= record.gachaId)
        throw new Error(`Homepage ${label}最近跃迁未按 GachaID 严格降序`);
      const entityId = entityIdOf(record);
      const entity = entities.get(entityId);
      if (!entity || entity.rarity !== 5)
        throw new Error(`Homepage ${label}最近跃迁包含无效目录实体：${entityId}`);
    }
  };

  validateSelection(data.avatarUps, (record) => record.avatarId, characterCatalog, '角色');
  validateSelection(data.weaponUps, (record) => record.equipmentId, lightConeCatalog, '光锥');
}

interface RecentWarpOptions<TIdKey extends 'avatarId' | 'equipmentId'> {
  type: 'AvatarUp' | 'WeaponUp';
  idKey: TIdKey;
  prefabPattern: RegExp;
  catalog: CatalogEntry[];
  entityLabel: '角色' | '光锥';
}

function parseGachaId(row: HomepageGachaRow, type: string): number {
  const gachaId =
    typeof row.GachaID === 'number'
      ? row.GachaID
      : typeof row.GachaID === 'string' && row.GachaID.trim()
        ? Number(row.GachaID)
        : Number.NaN;
  if (!Number.isSafeInteger(gachaId) || gachaId <= 0)
    throw new Error(`${type} 包含无效 GachaID：${String(row.GachaID)}`);
  return gachaId;
}

function selectRecentWarps<TIdKey extends 'avatarId' | 'equipmentId'>(
  rows: HomepageGachaRow[],
  options: RecentWarpOptions<TIdKey>
): Array<{ gachaId: number } & Record<TIdKey, string>> {
  const matching = rows
    .filter((row) => row.GachaType === options.type)
    .map((row) => ({ row, gachaId: parseGachaId(row, options.type) }))
    .sort((left, right) => right.gachaId - left.gachaId);

  if (matching.length < HOMEPAGE_RECENT_WARP_LIMIT)
    throw new Error(
      `${options.type} 记录不足：需要 ${HOMEPAGE_RECENT_WARP_LIMIT} 条，实际 ${matching.length} 条`
    );

  const selected = matching.slice(0, HOMEPAGE_RECENT_WARP_LIMIT);
  for (let index = 1; index < selected.length; index += 1) {
    if (selected[index - 1].gachaId <= selected[index].gachaId)
      throw new Error(`${options.type} 最近记录的 GachaID 不是严格降序`);
  }

  const catalog = new Map(options.catalog.map((entry) => [entry.id, entry]));
  return selected.map(({ row, gachaId }) => {
    if (typeof row.PrefabPath !== 'string')
      throw new Error(`Unable to resolve ${options.type} ${gachaId}: PrefabPath 缺失`);
    const match = options.prefabPattern.exec(row.PrefabPath);
    const entityId = match?.[1];
    if (!entityId)
      throw new Error(
        `Unable to resolve ${options.type} ${gachaId}: PrefabPath ${row.PrefabPath} 无法解析`
      );
    const entity = catalog.get(entityId);
    if (!entity)
      throw new Error(
        `Unable to resolve ${options.type} ${gachaId}: ${options.entityLabel} ${entityId} 不在目录中`
      );
    if (entity.rarity !== 5)
      throw new Error(
        `Unable to resolve ${options.type} ${gachaId}: ${options.entityLabel} ${entityId} 不是五星`
      );
    return { gachaId, [options.idKey]: entityId } as {
      gachaId: number;
    } & Record<TIdKey, string>;
  });
}

export function buildHomepageRecentWarpData(
  rows: HomepageGachaRow[],
  characterCatalog: CatalogEntry[],
  lightConeCatalog: CatalogEntry[]
): HomepageRecentWarpData {
  const data: HomepageRecentWarpData = {
    schemaVersion: 1,
    avatarUps: selectRecentWarps(rows, {
      type: 'AvatarUp',
      idKey: 'avatarId',
      prefabPattern: /AvatarGacha_(\d+)\.prefab$/,
      catalog: characterCatalog,
      entityLabel: '角色'
    }),
    weaponUps: selectRecentWarps(rows, {
      type: 'WeaponUp',
      idKey: 'equipmentId',
      prefabPattern: /LightConeGacha_(\d+)\.prefab$/,
      catalog: lightConeCatalog,
      entityLabel: '光锥'
    })
  };
  assertHomepageRecentWarpData(data, characterCatalog, lightConeCatalog);
  return data;
}
