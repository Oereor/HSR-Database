export const PLAYER_PROPERTY_SEMANTICS = {
  BaseHP: { target: 'hp', bucket: 'base', percent: false, visibleField: 'hp' },
  HPAddedRatio: { target: 'hp', bucket: 'ratio', percent: true },
  HPDelta: { target: 'hp', bucket: 'flat', percent: false },
  BaseAttack: { target: 'atk', bucket: 'base', percent: false, visibleField: 'atk' },
  AttackAddedRatio: { target: 'atk', bucket: 'ratio', percent: true },
  AttackDelta: { target: 'atk', bucket: 'flat', percent: false },
  BaseDefence: { target: 'def', bucket: 'base', percent: false, visibleField: 'def' },
  DefenceAddedRatio: { target: 'def', bucket: 'ratio', percent: true },
  DefenceDelta: { target: 'def', bucket: 'flat', percent: false },
  BaseSpeed: { target: 'spd', bucket: 'base', percent: false, visibleField: 'spd' },
  SpeedAddedRatio: { target: 'spd', bucket: 'ratio', percent: true },
  SpeedDelta: { target: 'spd', bucket: 'flat', percent: false },
  CriticalChanceBase: {
    target: 'crit_rate',
    bucket: 'direct',
    percent: true,
    visibleField: 'crit_rate'
  },
  CriticalDamageBase: {
    target: 'crit_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'crit_dmg'
  },
  BreakDamageAddedRatioBase: {
    target: 'break_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'break_dmg'
  },
  StatusProbabilityBase: {
    target: 'effect_hit',
    bucket: 'direct',
    percent: true,
    visibleField: 'effect_hit'
  },
  StatusResistanceBase: {
    target: 'effect_res',
    bucket: 'direct',
    percent: true,
    visibleField: 'effect_res'
  },
  SPRatioBase: {
    target: 'sp_rate',
    bucket: 'direct',
    percent: true,
    visibleField: 'sp_rate'
  },
  HealRatioBase: {
    target: 'heal_rate',
    bucket: 'direct',
    percent: true,
    visibleField: 'heal_rate'
  },
  HealTakenRatio: { target: 'heal_taken', bucket: 'direct', percent: true },
  AllDamageTypeAddedRatio: { target: 'all_dmg', bucket: 'direct', percent: true },
  PhysicalAddedRatio: {
    target: 'physical_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'physical_dmg'
  },
  FireAddedRatio: {
    target: 'fire_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'fire_dmg'
  },
  IceAddedRatio: {
    target: 'ice_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'ice_dmg'
  },
  ThunderAddedRatio: {
    target: 'thunder_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'thunder_dmg'
  },
  WindAddedRatio: {
    target: 'wind_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'wind_dmg'
  },
  QuantumAddedRatio: {
    target: 'quantum_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'quantum_dmg'
  },
  ImaginaryAddedRatio: {
    target: 'imaginary_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'imaginary_dmg'
  },
  ElationDamageAddedRatioBase: {
    target: 'elation_dmg',
    bucket: 'direct',
    percent: true,
    visibleField: 'elation_dmg'
  }
} as const;

export type PlayerPropertyType = keyof typeof PLAYER_PROPERTY_SEMANTICS;
export type PlayerStatTarget = (typeof PLAYER_PROPERTY_SEMANTICS)[PlayerPropertyType]['target'];
export type PropertyContributionBucket = 'base' | 'ratio' | 'flat' | 'direct';
export type PropertyContributionSource =
  'avatar' | 'lightCone' | 'lightConeAbility' | 'relicMain' | 'relicSub' | 'relicSet' | 'trace';

export interface PropertyContribution {
  propertyType: PlayerPropertyType;
  value: number;
  source: PropertyContributionSource;
  sourceId: string;
}

export function isPlayerPropertyType(value: string): value is PlayerPropertyType {
  return Object.hasOwn(PLAYER_PROPERTY_SEMANTICS, value);
}
