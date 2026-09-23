import { describe, expect, it } from 'vitest';
import {
  PLAYER_PROPERTY_SEMANTICS,
  type PropertyContribution
} from '../../src/lib/player/property-semantics';
import {
  aggregatePropertyContributions,
  collectPropertyContributions,
  finalizePlayerStats,
  presentCanonicalPlayerProfile,
  synthesizePlayerCharacter
} from '../../src/lib/player/stat-synthesis';
import { playerRuntimeData } from '../../api/_player/enka/pipeline';
import type { PlayerRuntimeData } from '../../src/lib/player/runtime-data';

describe('Player property semantics and stat finalization', () => {
  it('registers the complete 29-property universe explicitly', () => {
    expect(Object.keys(PLAYER_PROPERTY_SEMANTICS)).toHaveLength(29);
    expect(PLAYER_PROPERTY_SEMANTICS.BaseSpeed).toMatchObject({
      target: 'spd',
      bucket: 'base'
    });
    expect(PLAYER_PROPERTY_SEMANTICS.CriticalChanceBase).toMatchObject({
      target: 'crit_rate',
      bucket: 'direct'
    });
    expect(playerRuntimeData.propertyTypes.slice().sort()).toEqual(
      Object.keys(PLAYER_PROPERTY_SEMANTICS).sort()
    );
  });

  it.each([
    [104, 0.06, 54.232, 164.472],
    [101, 0.12, 68.832, 181.952],
    [95, -0.08, 4.9, 92.3]
  ])(
    'applies speed base-ratio-flat ordering: %s × (1 + %s) + %s = %s',
    (base, ratio, flat, expected) => {
      const contributions: PropertyContribution[] = [
        { propertyType: 'BaseSpeed', value: base, source: 'avatar', sourceId: 'x' },
        { propertyType: 'SpeedAddedRatio', value: ratio, source: 'relicSet', sourceId: 'x' },
        { propertyType: 'SpeedDelta', value: flat, source: 'relicSub', sourceId: 'x' }
      ];
      const result = finalizePlayerStats(aggregatePropertyContributions(contributions));
      expect(result.values.spd).toBeCloseTo(expected, 12);
      expect(result.stats).toEqual([
        { field: 'spd', percent: false, total: String(Math.trunc(expected)) }
      ]);
    }
  );

  it('resolves avatar, light-cone, affix, set and minor-trace sources independently', () => {
    const runtime: PlayerRuntimeData = {
      schemaVersion: 2,
      propertyTypes: Object.keys(PLAYER_PROPERTY_SEMANTICS) as PlayerRuntimeData['propertyTypes'],
      avatarPromotions: {
        avatar: {
          '0': {
            hpBase: 100,
            hpAdd: 2,
            attackBase: 20,
            attackAdd: 1,
            defenceBase: 30,
            defenceAdd: 1,
            speedBase: 90,
            criticalChance: 0.05,
            criticalDamage: 0.5
          }
        }
      },
      lightConePromotions: {
        cone: {
          '0': {
            hpBase: 10,
            hpAdd: 1,
            attackBase: 5,
            attackAdd: 1,
            defenceBase: 4,
            defenceAdd: 1
          }
        }
      },
      lightConeAbilities: {
        cone: { '1': [{ propertyType: 'AttackAddedRatio', value: 0.1 }] }
      },
      relics: {
        relic: { setId: 'set', slot: 1, mainAffixGroup: 'main', subAffixGroup: 'sub' }
      },
      relicMainAffixes: {
        'main:1': { propertyType: 'HPDelta', baseValue: 10, levelAdd: 2 }
      },
      relicSubAffixes: {
        'sub:2': { propertyType: 'SpeedDelta', baseValue: 1, stepValue: 0.5, stepNum: 2 }
      },
      relicSets: {
        set: [
          {
            required: 2,
            properties: [{ propertyType: 'CriticalChanceBase', value: 0.2 }]
          }
        ]
      },
      traces: {
        trace: {
          pointType: 1,
          skillIds: [],
          properties: [{ propertyType: 'StatusResistanceBase', value: 0.3 }]
        }
      },
      eidolonSkillLevels: { avatar: {} }
    };
    const result = collectPropertyContributions(
      {
        buildId: 'sources',
        avatarId: 'avatar',
        display: { area: 'showcase', sourceOrder: 0 },
        level: 3,
        promotion: 0,
        eidolon: 0,
        traces: [{ pointId: 'trace', rawLevel: 1 }],
        lightCone: { lightConeId: 'cone', superimposition: 1, level: 2, promotion: 0 },
        relics: [1, 2].map((type) => ({
          tid: 'relic',
          type: type as 1 | 2,
          level: 1,
          mainAffixId: 1,
          subAffixes: [{ affixId: 2, cnt: 2, step: 3 }]
        }))
      },
      runtime
    );
    expect(result.diagnostics).toEqual([]);
    const values = (source: PropertyContribution['source']) =>
      result.contributions.filter((entry) => entry.source === source).map((entry) => entry.value);
    expect(values('avatar')).toContain(104);
    expect(values('lightCone')).toContain(11);
    expect(values('lightConeAbility')).toEqual([0.1]);
    expect(values('relicMain')).toEqual([12, 12]);
    expect(values('relicSub')).toEqual([3.5, 3.5]);
    expect(values('relicSet')).toEqual([0.2]);
    expect(values('trace')).toEqual([0.3]);
  });

  it('keeps ERR as a bonus and does not emit internal AllDamage/HealTaken rows', () => {
    const result = finalizePlayerStats(
      aggregatePropertyContributions([
        { propertyType: 'SPRatioBase', value: 0.194394015, source: 'relicSet', sourceId: 'x' },
        {
          propertyType: 'AllDamageTypeAddedRatio',
          value: 0.2,
          source: 'lightConeAbility',
          sourceId: 'x'
        },
        {
          propertyType: 'HealTakenRatio',
          value: 0.1,
          source: 'lightConeAbility',
          sourceId: 'x'
        }
      ])
    );
    expect(result.values).toMatchObject({ sp_rate: 0.194394015, all_dmg: 0.2, heal_taken: 0.1 });
    expect(result.stats).toEqual([{ field: 'sp_rate', percent: true, total: '19.4%' }]);
  });

  it('fails only the affected build for an unknown entity', () => {
    const result = synthesizePlayerCharacter(
      {
        buildId: 'unknown',
        avatarId: '99999999',
        display: { area: 'unknown', sourceOrder: 0 },
        level: 1,
        promotion: 0,
        eidolon: 0,
        traces: [],
        relics: []
      },
      playerRuntimeData
    );
    expect(result.status).toBe('failed');
    expect(result.stats).toEqual([]);
    expect(result.diagnostics).toEqual([{ code: 'UNKNOWN_AVATAR', sourceId: '99999999' }]);
  });

  it('fails closed when a runtime contribution contains an unknown PropertyType', () => {
    const runtime = structuredClone(playerRuntimeData);
    runtime.lightConeAbilities['23025']['1'][0] = {
      propertyType: 'FutureProperty' as never,
      value: 1
    };
    const result = synthesizePlayerCharacter(
      {
        buildId: 'future-property',
        avatarId: '1310',
        display: { area: 'unknown', sourceOrder: 0 },
        level: 80,
        promotion: 6,
        eidolon: 0,
        traces: [],
        lightCone: { lightConeId: '23025', superimposition: 1, level: 80, promotion: 6 },
        relics: []
      },
      runtime
    );
    expect(result.status).toBe('failed');
    expect(result.diagnostics).toContainEqual({
      code: 'UNKNOWN_PROPERTY_TYPE',
      sourceId: '23025',
      propertyType: 'FutureProperty'
    });
  });

  it('collects independent sources and applies eidolon skill-level additions for presentation', () => {
    const build = {
      buildId: 'all-sources',
      avatarId: '8006',
      display: { area: 'showcase' as const, position: 3, sourceOrder: 0 },
      level: 80,
      promotion: 6,
      eidolon: 6,
      traces: [
        { pointId: '8006001', rawLevel: 3 },
        { pointId: '8006201', rawLevel: 1 }
      ],
      lightCone: { lightConeId: '23025', superimposition: 1, level: 80, promotion: 6 },
      relics: []
    };
    const collected = collectPropertyContributions(build, playerRuntimeData);
    expect(new Set(collected.contributions.map(({ source }) => source))).toEqual(
      new Set(['avatar', 'lightCone', 'lightConeAbility', 'trace'])
    );
    const synthesized = synthesizePlayerCharacter(build, playerRuntimeData);
    const presentation = presentCanonicalPlayerProfile(
      {
        profile: {
          uid: '100000001',
          nickname: '',
          level: 70,
          worldLevel: 6,
          characters: [build]
        },
        characters: [synthesized]
      },
      playerRuntimeData
    );
    expect(presentation.characters[0].skillTree[0]).toEqual({ id: '8006001', level: 4 });
  });
});
