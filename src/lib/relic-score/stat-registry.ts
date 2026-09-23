import type { RelicSlot } from '../domain/types.js';
import {
  PLAYER_PROPERTY_SEMANTICS,
  type PlayerPropertyType,
  type PlayerStatTarget
} from '../player/property-semantics.js';

const ALL_VARIABLE_SLOTS = ['BODY', 'FOOT', 'NECK', 'OBJECT'] as const;

export const RELIC_STAT_REGISTRY = {
  HPDelta: { mainSlots: ['HEAD'], sub: true },
  AttackDelta: { mainSlots: ['HAND'], sub: true },
  DefenceDelta: { mainSlots: [], sub: true },
  HPAddedRatio: { mainSlots: ALL_VARIABLE_SLOTS, sub: true },
  AttackAddedRatio: { mainSlots: ALL_VARIABLE_SLOTS, sub: true },
  DefenceAddedRatio: { mainSlots: ALL_VARIABLE_SLOTS, sub: true },
  SpeedDelta: { mainSlots: ['FOOT'], sub: true },
  CriticalChanceBase: { mainSlots: ['BODY'], sub: true },
  CriticalDamageBase: { mainSlots: ['BODY'], sub: true },
  HealRatioBase: { mainSlots: ['BODY'], sub: false },
  StatusProbabilityBase: { mainSlots: ['BODY'], sub: true },
  StatusResistanceBase: { mainSlots: [], sub: true },
  BreakDamageAddedRatioBase: { mainSlots: ['OBJECT'], sub: true },
  SPRatioBase: { mainSlots: ['OBJECT'], sub: false },
  PhysicalAddedRatio: { mainSlots: ['NECK'], sub: false },
  FireAddedRatio: { mainSlots: ['NECK'], sub: false },
  IceAddedRatio: { mainSlots: ['NECK'], sub: false },
  ThunderAddedRatio: { mainSlots: ['NECK'], sub: false },
  WindAddedRatio: { mainSlots: ['NECK'], sub: false },
  QuantumAddedRatio: { mainSlots: ['NECK'], sub: false },
  ImaginaryAddedRatio: { mainSlots: ['NECK'], sub: false }
} as const satisfies Partial<
  Record<PlayerPropertyType, { mainSlots: readonly RelicSlot[]; sub: boolean }>
>;

export type RelicStatKey = keyof typeof RELIC_STAT_REGISTRY;

export interface RelicStatSemantics {
  mainSlots: readonly RelicSlot[];
  canBeSubstat: boolean;
  percent: boolean;
  panelTarget: PlayerStatTarget;
}

export function isRelicStatKey(value: string): value is RelicStatKey {
  return Object.hasOwn(RELIC_STAT_REGISTRY, value);
}

export function relicStatSemantics(key: RelicStatKey): RelicStatSemantics {
  const entry = RELIC_STAT_REGISTRY[key];
  const property = PLAYER_PROPERTY_SEMANTICS[key];
  return {
    mainSlots: entry.mainSlots,
    canBeSubstat: entry.sub,
    percent: property.percent,
    panelTarget: property.target
  };
}
