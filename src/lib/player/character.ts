import type { Eidolon, RelicProperty, SkillProgression } from '$lib/domain/types';
import type { PlayerCharacter, PlayerProfile, PlayerStat } from './contract.js';

export type PlayerProgressionState = 'active' | 'inactive' | 'unresolved';
export type PlayerEidolonState = Exclude<PlayerProgressionState, 'unresolved'>;

export interface ResolvedPlayerStat {
  stat: PlayerStat;
  label: string;
  property: RelicProperty | null;
}

export interface GroupedPlayerStats {
  primary: ResolvedPlayerStat[];
  other: ResolvedPlayerStat[];
}

export const PRIMARY_PLAYER_STAT_FIELDS = new Set([
  'hp',
  'atk',
  'def',
  'spd',
  'crit_rate',
  'crit_dmg'
]);

const PLAYER_STAT_PROPERTY_TYPES: Readonly<Record<string, string>> = {
  hp: 'HPDelta',
  atk: 'AttackDelta',
  def: 'DefenceDelta',
  spd: 'SpeedDelta',
  crit_rate: 'CriticalChanceBase',
  crit_dmg: 'CriticalDamageBase',
  break_dmg: 'BreakDamageAddedRatioBase',
  effect_hit: 'StatusProbabilityBase',
  effect_res: 'StatusResistanceBase',
  heal_rate: 'HealRatioBase',
  sp_rate: 'SPRatioBase',
  physical_dmg: 'PhysicalAddedRatio',
  fire_dmg: 'FireAddedRatio',
  ice_dmg: 'IceAddedRatio',
  thunder_dmg: 'ThunderAddedRatio',
  wind_dmg: 'WindAddedRatio',
  quantum_dmg: 'QuantumAddedRatio',
  imaginary_dmg: 'ImaginaryAddedRatio'
};

export function findPlayerCharacter(
  profile: PlayerProfile,
  characterId: string
): PlayerCharacter | null {
  return profile.characters.find((character) => character.characterId === characterId) ?? null;
}

export function createPlayerSkillTreeIndex(
  skillTree: PlayerCharacter['skillTree']
): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  for (const entry of skillTree) {
    if (!index.has(entry.id)) index.set(entry.id, entry.level);
  }
  return index;
}

export function resolvePlayerSkillLevel(
  progression: SkillProgression,
  skillTree: ReadonlyMap<string, number>
): number | null {
  const level = skillTree.get(progression.id);
  return level !== undefined && progression.availableLevels.includes(level) ? level : null;
}

export function resolvePlayerTraceState(
  traceId: string,
  skillTree: ReadonlyMap<string, number>
): PlayerProgressionState {
  const level = skillTree.get(traceId);
  if (level === undefined || !Number.isSafeInteger(level) || level < 0) return 'unresolved';
  return level > 0 ? 'active' : 'inactive';
}

export function resolvePlayerEidolonState(
  eidolon: Pick<Eidolon, 'rank'>,
  playerRank: number
): PlayerEidolonState {
  return eidolon.rank <= playerRank ? 'active' : 'inactive';
}

export function groupPlayerStats(
  stats: PlayerStat[],
  properties: RelicProperty[]
): GroupedPlayerStats {
  const propertiesByType = new Map(properties.map((property) => [property.propertyType, property]));
  const result: GroupedPlayerStats = { primary: [], other: [] };

  for (const stat of stats) {
    const propertyType = PLAYER_STAT_PROPERTY_TYPES[stat.field];
    const property = propertyType ? (propertiesByType.get(propertyType) ?? null) : null;
    const resolved: ResolvedPlayerStat = {
      stat,
      property,
      label: property?.name ?? stat.field
    };
    (PRIMARY_PLAYER_STAT_FIELDS.has(stat.field) ? result.primary : result.other).push(resolved);
  }

  return result;
}

function signedAddition(value: string): string {
  return /^[+-]/.test(value) ? value : `+${value}`;
}

export function formatPlayerStatBreakdown(stat: PlayerStat): string {
  if (stat.base !== null && stat.addition !== null)
    return `${stat.base} ${signedAddition(stat.addition)}`;
  if (stat.base !== null) return stat.base;
  if (stat.addition !== null) return signedAddition(stat.addition);
  return stat.total;
}
