import type { Eidolon, RelicProperty, SkillProgression } from '$lib/domain/types';
import type { PlayerCharacter, PlayerProfile, PlayerStat } from './contract.js';

export type PlayerProgressionState = 'active' | 'inactive' | 'unresolved';
export type PlayerEidolonState = Exclude<PlayerProgressionState, 'unresolved'>;

export interface ResolvedPlayerStat {
  stat: PlayerStat;
  label: string;
  iconKey?: string;
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
  elation_dmg: 'ElationDamageAddedRatioBase',
  physical_dmg: 'PhysicalAddedRatio',
  fire_dmg: 'FireAddedRatio',
  ice_dmg: 'IceAddedRatio',
  thunder_dmg: 'ThunderAddedRatio',
  wind_dmg: 'WindAddedRatio',
  quantum_dmg: 'QuantumAddedRatio',
  imaginary_dmg: 'ImaginaryAddedRatio'
};

export function resolvePlayerStatIdentity(
  field: string,
  propertiesByType: ReadonlyMap<string, RelicProperty>,
  fallbackLabels: Readonly<Record<string, string>> = {}
): Pick<ResolvedPlayerStat, 'label' | 'iconKey'> {
  const propertyType = PLAYER_STAT_PROPERTY_TYPES[field];
  const property = propertyType ? propertiesByType.get(propertyType) : undefined;
  return {
    label: property?.name ?? fallbackLabels[field] ?? field,
    ...(property?.iconKey
      ? { iconKey: property.iconKey }
      : field === 'elation_dmg'
        ? { iconKey: 'IconJoy' }
        : {})
  };
}

export function findPlayerCharacter(
  profile: PlayerProfile,
  characterId: string,
  buildId?: string
): PlayerCharacter | null {
  return (
    profile.characters.find(
      (character) =>
        character.characterId === characterId &&
        (buildId === undefined || character.buildId === buildId)
    ) ?? null
  );
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
  if (level === undefined) return 'inactive';
  if (!Number.isSafeInteger(level) || level < 0) return 'unresolved';
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
  properties: RelicProperty[],
  fallbackLabels: Readonly<Record<string, string>> = {}
): GroupedPlayerStats {
  const propertiesByType = new Map(properties.map((property) => [property.propertyType, property]));
  const result: GroupedPlayerStats = { primary: [], other: [] };

  for (const stat of stats) {
    const resolved: ResolvedPlayerStat = {
      stat,
      ...resolvePlayerStatIdentity(stat.field, propertiesByType, fallbackLabels)
    };
    (PRIMARY_PLAYER_STAT_FIELDS.has(stat.field) ? result.primary : result.other).push(resolved);
  }

  return result;
}

export function formatPlayerStatTotal(stat: PlayerStat): string {
  if (stat.field !== 'sp_rate' || !stat.percent) return stat.total;

  const match = /^([+-]?\d+)(?:\.(\d+))?%$/.exec(stat.total);
  if (!match) return stat.total;

  const decimalPlaces = match[2]?.length ?? 0;
  const rawPercentage = Number(`${match[1]}${match[2] === undefined ? '' : `.${match[2]}`}`);
  if (!Number.isFinite(rawPercentage)) return stat.total;

  // The DTO stores the bonus; the Player Stats UI presents the in-game 100% baseline total.
  return `${(rawPercentage + 100).toFixed(decimalPlaces)}%`;
}
