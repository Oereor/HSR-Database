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

  it('retains StepNum and rejects duplicate or nonpositive sub affixes', () => {
    const source = tables();
    const sub = {
      GroupID: 5,
      AffixID: 7,
      Property: 'SpeedDelta',
      BaseValue: { Value: 2 },
      StepValue: { Value: 0.3 },
      StepNum: 3
    };
    source.RelicSubAffixConfig = [sub];
    expect(buildPlayerRuntimeData(source).relicSubAffixes['5:7']).toMatchObject({
      stepValue: 0.3,
      stepNum: 3
    });
    source.RelicSubAffixConfig = [sub, sub];
    expect(() => buildPlayerRuntimeData(source)).toThrow('duplicate sub');
    source.RelicSubAffixConfig = [{ ...sub, StepNum: 0 }];
    expect(() => buildPlayerRuntimeData(source)).toThrow('StepNum must be positive');
  });
});
