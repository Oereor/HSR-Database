import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPlayerRuntimeData } from '../../scripts/data/player-runtime';
import { PLAYER_PROPERTY_SEMANTICS } from '../../src/lib/player/property-semantics';

function tables(): Record<string, Array<Record<string, unknown>>> {
  return {
    AvatarPromotionConfig: [],
    EquipmentPromotionConfig: [],
    EquipmentConfig: [],
    EquipmentSkillConfig: [],
    RelicConfig: [],
    RelicMainAffixConfig: Object.keys(PLAYER_PROPERTY_SEMANTICS).map((propertyType, index) => ({
      GroupID: 1,
      AffixID: index + 1,
      Property: propertyType,
      BaseValue: { Value: 1 },
      LevelAdd: { Value: 0 }
    })),
    RelicSubAffixConfig: [],
    RelicSetSkillConfig: [],
    AvatarSkillTreeConfig: [],
    AvatarRankConfig: [],
    AvatarConfig: []
  };
}

describe('player runtime generation validation', () => {
  it('emits the complete registered property inventory', () => {
    const result = buildPlayerRuntimeData(tables());
    expect(result.propertyTypes).toHaveLength(29);
    expect(result.propertyTypes.slice().sort()).toEqual(
      Object.keys(PLAYER_PROPERTY_SEMANTICS).sort()
    );
    expect(statSync('src/lib/generated/runtime/player.json').size).toBeLessThan(600_000);
  });

  it('rejects unknown properties, PointType drift and malformed set properties', () => {
    const unknown = tables();
    unknown.RelicMainAffixConfig[0].Property = 'FutureProperty';
    expect(() => buildPlayerRuntimeData(unknown)).toThrow('unknown PropertyType=FutureProperty');

    const pointType = tables();
    pointType.AvatarSkillTreeConfig = [{ PointID: 1, PointType: 1, StatusAddList: [] }];
    expect(() => buildPlayerRuntimeData(pointType)).toThrow('[player-runtime/trace]');

    const relicSet = tables();
    relicSet.RelicSetSkillConfig = [{ SetID: 1, RequireNum: 2, PropertyList: {} }];
    expect(() => buildPlayerRuntimeData(relicSet)).toThrow('PropertyList must be an array');
  });
});
