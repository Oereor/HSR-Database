import { describe, expect, it } from 'vitest';
import type { RelicProperty, SkillProgression } from '../../src/lib/domain/types';
import type { PlayerProfile, PlayerStat } from '../../src/lib/player/contract';
import {
  createPlayerSkillTreeIndex,
  findPlayerCharacter,
  formatPlayerStatBreakdown,
  groupPlayerStats,
  resolvePlayerEidolonState,
  resolvePlayerSkillLevel,
  resolvePlayerTraceState
} from '../../src/lib/player/character';

const profile: PlayerProfile = {
  uid: '100000001',
  nickname: 'Synthetic Player',
  level: 70,
  worldLevel: 6,
  avatar: null,
  signature: '',
  characterCount: 1,
  lightConeCount: null,
  achievementCount: null,
  characters: [
    {
      characterId: '1304',
      progression: { rank: 3, level: 80, promotion: 6, enhanced: false },
      skillTree: [
        { id: '1304001', level: 6 },
        { id: '1304101', level: 1 },
        { id: '1304102', level: 0 }
      ],
      lightCone: null,
      relics: [],
      stats: []
    }
  ]
};

describe('Player Character resolvers', () => {
  it('matches only the exact static character id and returns null when not showcased', () => {
    expect(findPlayerCharacter(profile, '1304')).toBe(profile.characters[0]);
    expect(findPlayerCharacter(profile, '130')).toBeNull();
    expect(findPlayerCharacter(profile, '9999')).toBeNull();
  });

  it('uses the first skill-tree occurrence and resolves only locally valid skill levels', () => {
    const index = createPlayerSkillTreeIndex([
      { id: '1304001', level: 6 },
      { id: '1304001', level: 9 },
      { id: 'invalid-local-level', level: 16 }
    ]);
    const progression: SkillProgression = {
      id: '1304001',
      availableLevels: [1, 2, 3, 4, 5, 6],
      defaultLevel: 6,
      variantIds: ['130401']
    };

    expect(resolvePlayerSkillLevel(progression, index)).toBe(6);
    expect(resolvePlayerSkillLevel({ ...progression, id: 'missing' }, index)).toBeNull();
    expect(
      resolvePlayerSkillLevel({ ...progression, id: 'invalid-local-level' }, index)
    ).toBeNull();
  });

  it('derives active, inactive and unresolved Trace states without conflating missing with zero', () => {
    const index = createPlayerSkillTreeIndex(profile.characters[0].skillTree);
    expect(resolvePlayerTraceState('1304101', index)).toBe('active');
    expect(resolvePlayerTraceState('1304102', index)).toBe('inactive');
    expect(resolvePlayerTraceState('1304103', index)).toBe('unresolved');
  });

  it.each([
    [0, ['inactive', 'inactive', 'inactive', 'inactive', 'inactive', 'inactive']],
    [3, ['active', 'active', 'active', 'inactive', 'inactive', 'inactive']],
    [6, ['active', 'active', 'active', 'active', 'active', 'active']]
  ] as const)('derives sequential Eidolon states for rank %i', (rank, expected) => {
    expect(
      [1, 2, 3, 4, 5, 6].map((eidolonRank) =>
        resolvePlayerEidolonState({ rank: eidolonRank }, rank)
      )
    ).toEqual(expected);
  });
});

describe('Player stat projection', () => {
  const mappings = [
    ['hp', 'HPDelta'],
    ['atk', 'AttackDelta'],
    ['def', 'DefenceDelta'],
    ['spd', 'SpeedDelta'],
    ['crit_rate', 'CriticalChanceBase'],
    ['crit_dmg', 'CriticalDamageBase'],
    ['break_dmg', 'BreakDamageAddedRatioBase'],
    ['effect_hit', 'StatusProbabilityBase'],
    ['effect_res', 'StatusResistanceBase'],
    ['heal_rate', 'HealRatioBase'],
    ['sp_rate', 'SPRatioBase'],
    ['physical_dmg', 'PhysicalAddedRatio'],
    ['fire_dmg', 'FireAddedRatio'],
    ['ice_dmg', 'IceAddedRatio'],
    ['thunder_dmg', 'ThunderAddedRatio'],
    ['wind_dmg', 'WindAddedRatio'],
    ['quantum_dmg', 'QuantumAddedRatio'],
    ['imaginary_dmg', 'ImaginaryAddedRatio']
  ] as const;
  const properties: RelicProperty[] = mappings.map(([, propertyType]) => ({
    propertyType,
    name: `local:${propertyType}`,
    iconKey: `icon:${propertyType}`,
    allowedMainSlots: [],
    canBeSubStat: false
  }));
  const stat = (field: string): PlayerStat => ({
    field,
    percent: false,
    total: '100',
    base: '80',
    addition: '20'
  });

  it('keeps fixed primary semantics and preserves upstream order in both groups', () => {
    const fields = [
      'effect_hit',
      'hp',
      'elation_dmg',
      'crit_rate',
      'atk',
      'break_dmg',
      'def',
      'spd',
      'crit_dmg'
    ];
    const grouped = groupPlayerStats(fields.map(stat), properties);

    expect(grouped.primary.map((item) => item.stat.field)).toEqual([
      'hp',
      'crit_rate',
      'atk',
      'def',
      'spd',
      'crit_dmg'
    ]);
    expect(grouped.other.map((item) => item.stat.field)).toEqual([
      'effect_hit',
      'elation_dmg',
      'break_dmg'
    ]);
  });

  it.each(mappings)('maps %s to the local %s property', (field, propertyType) => {
    const resolved = groupPlayerStats([stat(field)], properties);
    const item = [...resolved.primary, ...resolved.other][0];
    expect(item.property?.propertyType).toBe(propertyType);
    expect(item.label).toBe(`local:${propertyType}`);
  });

  it('keeps unknown fields with their raw key and no icon metadata', () => {
    const item = groupPlayerStats([stat('elation_dmg')], properties).other[0];
    expect(item.label).toBe('elation_dmg');
    expect(item.property).toBeNull();
  });

  it.each([
    [{ base: '2900', addition: '6777', total: '9677' }, '2900 +6777'],
    [{ base: null, addition: '92.6%', total: '92.6%' }, '+92.6%'],
    [{ base: '100', addition: null, total: '100' }, '100'],
    [{ base: null, addition: null, total: '134.2' }, '134.2'],
    [{ base: '100', addition: '-10', total: '90' }, '100 -10']
  ] as const)('formats Breakdown without inventing zero values', (values, expected) => {
    expect(formatPlayerStatBreakdown({ field: 'test', percent: false, ...values })).toBe(expected);
  });
});
