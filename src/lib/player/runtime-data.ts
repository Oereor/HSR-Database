import { PLAYER_PROPERTY_SEMANTICS, type PlayerPropertyType } from './property-semantics.js';

export interface RuntimePropertyValue {
  propertyType: PlayerPropertyType;
  value: number;
}

export interface PlayerRuntimeProgression {
  hpBase: number;
  hpAdd: number;
  attackBase: number;
  attackAdd: number;
  defenceBase: number;
  defenceAdd: number;
  speedBase?: number;
  criticalChance?: number;
  criticalDamage?: number;
}

export interface PlayerRuntimeRelicIdentity {
  setId: string;
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  mainAffixGroup: string;
  subAffixGroup: string;
  rarity?: number;
  maxLevel?: number;
}

export interface PlayerRuntimeAffix {
  propertyType: PlayerPropertyType;
  baseValue: number;
  levelAdd?: number;
  stepValue?: number;
  stepNum?: number;
}

export interface PlayerRuntimeTrace {
  pointType: number;
  skillIds: string[];
  properties: RuntimePropertyValue[];
}

export interface PlayerRuntimeData {
  schemaVersion: 2;
  propertyTypes: PlayerPropertyType[];
  avatarPromotions: Record<string, Record<string, PlayerRuntimeProgression>>;
  lightConePromotions: Record<string, Record<string, PlayerRuntimeProgression>>;
  lightConeAbilities: Record<string, Record<string, RuntimePropertyValue[]>>;
  relics: Record<string, PlayerRuntimeRelicIdentity>;
  relicMainAffixes: Record<string, PlayerRuntimeAffix>;
  relicSubAffixes: Record<string, PlayerRuntimeAffix>;
  relicSets: Record<string, Array<{ required: 2 | 4; properties: RuntimePropertyValue[] }>>;
  traces: Record<string, PlayerRuntimeTrace>;
  eidolonSkillLevels: Record<
    string,
    Record<string, Array<{ skillId: string; levelDelta: number }>>
  >;
}

export function playerRuntimeKey(...parts: Array<string | number>): string {
  return parts.map(String).join(':');
}

export function playerMainAffixValue(affix: PlayerRuntimeAffix, level: number): number {
  return affix.baseValue + Number(affix.levelAdd) * level;
}

export function playerSubAffixValue(
  affix: PlayerRuntimeAffix,
  count: number,
  step: number
): number {
  return affix.baseValue * count + Number(affix.stepValue) * step;
}

export function assertPlayerRuntimeData(value: unknown): asserts value is PlayerRuntimeData {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Player runtime data must be an object');
  const source = value as Partial<PlayerRuntimeData>;
  if (
    source.schemaVersion !== 2 ||
    !Array.isArray(source.propertyTypes) ||
    JSON.stringify([...source.propertyTypes].sort()) !==
      JSON.stringify(Object.keys(PLAYER_PROPERTY_SEMANTICS).sort()) ||
    !source.avatarPromotions ||
    !source.lightConePromotions ||
    !source.lightConeAbilities ||
    !source.relics ||
    !source.relicMainAffixes ||
    !source.relicSubAffixes ||
    !source.relicSets ||
    !source.traces ||
    !source.eidolonSkillLevels ||
    Object.values(source.relicSubAffixes).some(
      (affix) =>
        affix.stepNum !== undefined && (!Number.isSafeInteger(affix.stepNum) || affix.stepNum <= 0)
    )
  )
    throw new Error('Player runtime data is incomplete');
}
