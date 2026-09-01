import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../../src/lib/domain/types';
import { buildHomepageRecentWarpData, type HomepageGachaRow } from '../../scripts/data/homepage';

const catalog = (ids: string[], rarity = 5): CatalogEntry[] =>
  ids.map((id) => ({ id, name: `Entity ${id}`, rarity }));

const avatar = (gachaId: number, avatarId: string, type = 'AvatarUp'): HomepageGachaRow => ({
  GachaID: gachaId,
  GachaType: type,
  PrefabPath: `UI/Drawcard/GachaPanelLimited/AvatarGacha_${avatarId}.prefab`
});

const weapon = (gachaId: number, equipmentId: string, type = 'WeaponUp'): HomepageGachaRow => ({
  GachaID: gachaId,
  GachaType: type,
  PrefabPath: `UI/Drawcard/GachaPanelLimited/LightConeGacha_${equipmentId}.prefab`
});

const baseRows = (): HomepageGachaRow[] => [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((gachaId) =>
    avatar(gachaId, gachaId >= 7 ? '1001' : String(1000 + gachaId))
  ),
  avatar(99, '1999', 'CollaborationAvatarUp'),
  ...[11, 12, 13, 14, 15, 16, 17, 18].map((gachaId) =>
    weapon(gachaId, gachaId >= 17 ? '21001' : String(21000 + gachaId - 10))
  ),
  weapon(199, '21999', 'CollaborationWeaponUp')
];

describe('Homepage 最近限定跃迁选择', () => {
  it('精确过滤类型、按 GachaID 降序取六条并保留重复实体', () => {
    const result = buildHomepageRecentWarpData(
      baseRows(),
      catalog(['1001', '1003', '1004', '1005', '1006', '1007', '1008']),
      catalog(['21001', '21003', '21004', '21005', '21006', '21007', '21008'])
    );

    expect(result.avatarUps).toEqual([
      { gachaId: 8, avatarId: '1001' },
      { gachaId: 7, avatarId: '1001' },
      { gachaId: 6, avatarId: '1006' },
      { gachaId: 5, avatarId: '1005' },
      { gachaId: 4, avatarId: '1004' },
      { gachaId: 3, avatarId: '1003' }
    ]);
    expect(result.weaponUps).toEqual([
      { gachaId: 18, equipmentId: '21001' },
      { gachaId: 17, equipmentId: '21001' },
      { gachaId: 16, equipmentId: '21006' },
      { gachaId: 15, equipmentId: '21005' },
      { gachaId: 14, equipmentId: '21004' },
      { gachaId: 13, equipmentId: '21003' }
    ]);
  });

  it('PrefabPath 无法解析时明确失败', () => {
    const rows = baseRows();
    rows.push({ GachaID: 20, GachaType: 'AvatarUp', PrefabPath: 'broken.prefab' });
    expect(() => buildHomepageRecentWarpData(rows, catalog(['1001']), catalog(['21001']))).toThrow(
      /Unable to resolve AvatarUp 20/
    );
  });

  it('记录不足时失败而不是静默渲染少卡', () => {
    expect(() =>
      buildHomepageRecentWarpData(
        [avatar(1, '1001'), weapon(1, '21001')],
        catalog(['1001']),
        catalog(['21001'])
      )
    ).toThrow(/AvatarUp 记录不足/);
  });

  it('目录缺失或稀有度不符时失败', () => {
    expect(() =>
      buildHomepageRecentWarpData(baseRows(), catalog(['1001']), catalog(['21001']))
    ).toThrow(/角色 1006 不在目录中/);
    expect(() =>
      buildHomepageRecentWarpData(
        baseRows(),
        catalog(['1001', '1003', '1004', '1005', '1006', '1007', '1008'], 4),
        catalog(['21001', '21003', '21004', '21005', '21006', '21007', '21008'])
      )
    ).toThrow(/不是五星/);
  });
});
