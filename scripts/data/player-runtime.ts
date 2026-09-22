import type {
  PlayerRuntimeAffix,
  PlayerRuntimeData,
  PlayerRuntimeProgression,
  RuntimePropertyValue
} from '../../src/lib/player/runtime-data.js';
import type { BaseStatProgression } from '../../src/lib/domain/types.js';
import { assertPlayerRuntimeData } from '../../src/lib/player/runtime-data.js';
import {
  PLAYER_PROPERTY_SEMANTICS,
  isPlayerPropertyType,
  type PlayerPropertyType
} from '../../src/lib/player/property-semantics.js';
import { numberOf } from './raw.js';
import { rows, type Raw } from './domain/shared.js';
import { characterStatFields, lightConeStatFields, normalizeStatProgression } from './stats.js';

const key = (...parts: unknown[]): string => parts.map(String).join(':');

export const PLAYER_RUNTIME_TABLE_NAMES = [
  'AvatarPromotionConfig',
  'EquipmentPromotionConfig',
  'EquipmentConfig',
  'EquipmentSkillConfig',
  'RelicConfig',
  'RelicMainAffixConfig',
  'RelicSubAffixConfig',
  'RelicSetSkillConfig',
  'AvatarSkillTreeConfig',
  'AvatarRankConfig',
  'AvatarConfig'
] as const;

function integer(value: unknown, context: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`${context} must be a non-negative integer`);
  return parsed;
}

function finite(value: unknown, context: string): number {
  const parsed = numberOf(value);
  if (!Number.isFinite(parsed)) throw new Error(`${context} must be finite`);
  return parsed;
}

function propertyValue(
  propertyType: unknown,
  value: unknown,
  context: string,
  discovered: Set<PlayerPropertyType>
): RuntimePropertyValue {
  const type = String(propertyType ?? '');
  if (!isPlayerPropertyType(type))
    throw new Error(`[player-runtime/property] ${context} unknown PropertyType=${type}`);
  const amount = numberOf(value);
  if (!Number.isFinite(amount))
    throw new Error(`[player-runtime/property] ${context} has non-finite value`);
  discovered.add(type);
  return { propertyType: type, value: amount };
}

function progression(
  stage: BaseStatProgression['stages'][number],
  row: Raw,
  avatar: boolean,
  context: string
): PlayerRuntimeProgression {
  return {
    hpBase: finite(stage.hp.base, `${context}.hpBase`),
    hpAdd: finite(stage.hp.perLevel, `${context}.hpAdd`),
    attackBase: finite(stage.attack.base, `${context}.attackBase`),
    attackAdd: finite(stage.attack.perLevel, `${context}.attackAdd`),
    defenceBase: finite(stage.defence.base, `${context}.defenceBase`),
    defenceAdd: finite(stage.defence.perLevel, `${context}.defenceAdd`),
    ...(avatar
      ? {
          speedBase: finite(row.SpeedBase, `${context}.speedBase`),
          criticalChance: finite(row.CriticalChance, `${context}.criticalChance`),
          criticalDamage: finite(row.CriticalDamage, `${context}.criticalDamage`)
        }
      : {})
  };
}

function affix(
  row: Raw,
  context: string,
  discovered: Set<PlayerPropertyType>,
  kind: 'main' | 'sub'
): PlayerRuntimeAffix {
  const property = propertyValue(row.Property, row.BaseValue, context, discovered);
  return {
    propertyType: property.propertyType,
    baseValue: property.value,
    ...(kind === 'main'
      ? { levelAdd: numberOf(row.LevelAdd) }
      : { stepValue: numberOf(row.StepValue) })
  };
}

function skillLevelDeltas(
  value: unknown,
  context: string
): Array<{ skillId: string; levelDelta: number }> {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value))
    return value.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new Error(`[player-runtime/schema] ${context} SkillAddLevelList`);
      const item = entry as Raw;
      return {
        skillId: String(item.SkillID),
        levelDelta: integer(item.Level, `${context} SkillAddLevelList.Level`)
      };
    });
  if (typeof value !== 'object')
    throw new Error(`[player-runtime/schema] ${context} SkillAddLevelList`);
  return Object.entries(value as Raw).map(([skillId, level]) => ({
    skillId,
    levelDelta: integer(level, `${context} SkillAddLevelList.${skillId}`)
  }));
}

export function buildPlayerRuntimeData(tables: Record<string, unknown>): PlayerRuntimeData {
  const discovered = new Set<PlayerPropertyType>();
  for (const type of [
    'BaseHP',
    'BaseAttack',
    'BaseDefence',
    'BaseSpeed',
    'CriticalChanceBase',
    'CriticalDamageBase'
  ] as const)
    discovered.add(type);
  const avatarPromotions: PlayerRuntimeData['avatarPromotions'] = {};
  const avatarPromotionRows = Map.groupBy(rows(tables, 'AvatarPromotionConfig'), (row) =>
    String(row.AvatarID)
  );
  for (const [id, stages] of avatarPromotionRows) {
    stages.sort(
      (left, right) =>
        integer(left.MaxLevel, `${id}.MaxLevel`) - integer(right.MaxLevel, `${id}.MaxLevel`)
    );
    if (
      new Set(stages.map((row) => integer(row.MaxLevel, `${id}.MaxLevel`))).size !== stages.length
    )
      throw new Error(`[player-runtime/promotion] Avatar ${id} has duplicate MaxLevel`);
    const normalized = normalizeStatProgression(stages, characterStatFields);
    for (const [promotion, row] of stages.entries())
      (avatarPromotions[id] ??= {})[String(promotion)] = progression(
        normalized.stages[promotion],
        row,
        true,
        `AvatarPromotionConfig ${id}:${promotion}`
      );
  }
  const lightConePromotions: PlayerRuntimeData['lightConePromotions'] = {};
  const lightConePromotionRows = Map.groupBy(rows(tables, 'EquipmentPromotionConfig'), (row) =>
    String(row.EquipmentID)
  );
  for (const [id, stages] of lightConePromotionRows) {
    stages.sort(
      (left, right) =>
        integer(left.MaxLevel, `${id}.MaxLevel`) - integer(right.MaxLevel, `${id}.MaxLevel`)
    );
    if (
      new Set(stages.map((row) => integer(row.MaxLevel, `${id}.MaxLevel`))).size !== stages.length
    )
      throw new Error(`[player-runtime/promotion] Light Cone ${id} has duplicate MaxLevel`);
    const normalized = normalizeStatProgression(stages, lightConeStatFields);
    for (const [promotion, row] of stages.entries())
      (lightConePromotions[id] ??= {})[String(promotion)] = progression(
        normalized.stages[promotion],
        row,
        false,
        `EquipmentPromotionConfig ${id}:${promotion}`
      );
  }
  const skills = new Map<string, Raw[]>();
  for (const row of rows(tables, 'EquipmentSkillConfig')) {
    const id = String(row.SkillID);
    skills.set(id, [...(skills.get(id) ?? []), row]);
  }
  const lightConeAbilities: PlayerRuntimeData['lightConeAbilities'] = {};
  for (const equipment of rows(tables, 'EquipmentConfig')) {
    const equipmentId = String(equipment.EquipmentID);
    const rankProperties: Record<string, RuntimePropertyValue[]> = {};
    for (const skill of skills.get(String(equipment.SkillID)) ?? []) {
      const rankValue = integer(skill.Level, `EquipmentSkillConfig ${equipment.SkillID}`);
      if (rankValue < 1 || rankValue > 5)
        throw new Error(
          `[player-runtime/rank] EquipmentSkillConfig ${equipment.SkillID} rank=${rankValue}`
        );
      const rank = String(rankValue);
      if (rankProperties[rank])
        throw new Error(
          `[player-runtime/rank] EquipmentSkillConfig ${equipment.SkillID} duplicate rank=${rank}`
        );
      rankProperties[rank] = Array.isArray(skill.AbilityProperty)
        ? skill.AbilityProperty.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry))
              throw new Error(
                `[player-runtime/schema] EquipmentSkillConfig ${equipment.SkillID}:${rank} AbilityProperty[${index}]`
              );
            const item = entry as Raw;
            return propertyValue(
              item.PropertyType,
              item.Value,
              `EquipmentSkillConfig ${equipment.SkillID}:${rank}`,
              discovered
            );
          })
        : [];
    }
    if (
      JSON.stringify(Object.keys(rankProperties).sort()) !==
      JSON.stringify(['1', '2', '3', '4', '5'])
    )
      throw new Error(`[player-runtime/rank] Equipment ${equipmentId} must define ranks 1-5`);
    lightConeAbilities[equipmentId] = rankProperties;
  }

  const relics: PlayerRuntimeData['relics'] = {};
  const relicSlots = {
    HEAD: 1,
    HAND: 2,
    BODY: 3,
    FOOT: 4,
    NECK: 5,
    OBJECT: 6
  } as const;
  for (const row of rows(tables, 'RelicConfig')) {
    const relicId = String(row.ID);
    const slot = relicSlots[String(row.Type) as keyof typeof relicSlots];
    if (!slot)
      throw new Error(
        `[player-runtime/schema] RelicConfig ${relicId} unsupported slot=${String(row.Type)}`
      );
    const rarityMatch = /Rarity(\d+)$/.exec(String(row.Rarity ?? ''));
    relics[relicId] = {
      setId: String(row.SetID),
      slot,
      mainAffixGroup: String(row.MainAffixGroup),
      subAffixGroup: String(row.SubAffixGroup),
      ...(rarityMatch ? { rarity: Number(rarityMatch[1]) } : {}),
      ...(row.MaxLevel === undefined
        ? {}
        : { maxLevel: integer(row.MaxLevel, `RelicConfig ${relicId} MaxLevel`) })
    };
  }

  const relicMainAffixes: PlayerRuntimeData['relicMainAffixes'] = {};
  for (const row of rows(tables, 'RelicMainAffixConfig'))
    relicMainAffixes[key(row.GroupID, row.AffixID)] = affix(
      row,
      `RelicMainAffixConfig ${key(row.GroupID, row.AffixID)}`,
      discovered,
      'main'
    );
  const relicSubAffixes: PlayerRuntimeData['relicSubAffixes'] = {};
  for (const row of rows(tables, 'RelicSubAffixConfig'))
    relicSubAffixes[key(row.GroupID, row.AffixID)] = affix(
      row,
      `RelicSubAffixConfig ${key(row.GroupID, row.AffixID)}`,
      discovered,
      'sub'
    );
  const mainGroups = new Set(
    Object.keys(relicMainAffixes).map((identity) => identity.split(':', 1)[0])
  );
  const subGroups = new Set(
    Object.keys(relicSubAffixes).map((identity) => identity.split(':', 1)[0])
  );
  for (const [relicId, identity] of Object.entries(relics)) {
    if (!mainGroups.has(identity.mainAffixGroup))
      throw new Error(
        `[player-runtime/fk] RelicConfig ${relicId} missing main affix group ${identity.mainAffixGroup}`
      );
    if (!subGroups.has(identity.subAffixGroup))
      throw new Error(
        `[player-runtime/fk] RelicConfig ${relicId} missing sub affix group ${identity.subAffixGroup}`
      );
  }

  const relicSets: PlayerRuntimeData['relicSets'] = {};
  for (const row of rows(tables, 'RelicSetSkillConfig')) {
    const setId = String(row.SetID);
    const required = integer(row.RequireNum, `RelicSetSkillConfig ${setId} RequireNum`);
    if (required !== 2 && required !== 4)
      throw new Error(
        `[player-runtime/schema] RelicSetSkillConfig ${setId} unsupported RequireNum=${required}`
      );
    const list = row.PropertyList;
    if (list !== undefined && !Array.isArray(list))
      throw new Error(
        `[player-runtime/schema] RelicSetSkillConfig ${setId}:${required} PropertyList must be an array`
      );
    const properties = (list ?? []).map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new Error(
          `[player-runtime/schema] RelicSetSkillConfig ${setId}:${required} PropertyList[${index}]`
        );
      const item = entry as Raw;
      return propertyValue(
        item.FODBMMCKAEN,
        item.MNDFOPKBHKP,
        `RelicSetSkillConfig ${setId}:${required}`,
        discovered
      );
    });
    (relicSets[setId] ??= []).push({ required, properties });
  }
  for (const [relicId, identity] of Object.entries(relics))
    if (!relicSets[identity.setId])
      throw new Error(`[player-runtime/fk] RelicConfig ${relicId} missing set ${identity.setId}`);

  const traces: PlayerRuntimeData['traces'] = {};
  for (const row of rows(tables, 'AvatarSkillTreeConfig')) {
    const pointId = String(row.PointID);
    const pointType = integer(row.PointType, `AvatarSkillTreeConfig ${pointId} PointType`);
    const status = row.StatusAddList;
    const count = Array.isArray(status) ? status.length : 0;
    if ((pointType === 1 && count !== 1) || (pointType !== 1 && count !== 0))
      throw new Error(
        `[player-runtime/trace] PointID=${pointId} PointType=${pointType} StatusAddList=${count}`
      );
    const properties = (Array.isArray(status) ? status : []).map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new Error(
          `[player-runtime/schema] AvatarSkillTreeConfig ${pointId} StatusAddList[${index}]`
        );
      const item = entry as Raw;
      return propertyValue(
        item.PropertyType,
        item.Value,
        `AvatarSkillTreeConfig ${pointId}`,
        discovered
      );
    });
    const skillIds = Array.isArray(row.LevelUpSkillID)
      ? row.LevelUpSkillID.map((skillId) => String(skillId))
      : [];
    const previous = traces[pointId];
    if (!previous || properties.length) traces[pointId] = { pointType, skillIds, properties };
  }

  const rankRows = new Map(
    rows(tables, 'AvatarRankConfig').map((row) => [String(row.RankID), row])
  );
  const eidolonSkillLevels: PlayerRuntimeData['eidolonSkillLevels'] = {};
  for (const avatar of rows(tables, 'AvatarConfig')) {
    const avatarId = String(avatar.AvatarID);
    const byRank: Record<string, Array<{ skillId: string; levelDelta: number }>> = {};
    const rankIds = Array.isArray(avatar.RankIDList) ? avatar.RankIDList : [];
    for (const rankId of rankIds) {
      const row = rankRows.get(String(rankId));
      if (!row)
        throw new Error(
          `[player-runtime/fk] AvatarConfig ${avatarId} missing AvatarRankConfig ${rankId}`
        );
      const rank = String(integer(row.Rank, `AvatarRankConfig ${rankId} Rank`));
      byRank[rank] = skillLevelDeltas(row.SkillAddLevelList, `AvatarRankConfig ${rankId}`);
    }
    eidolonSkillLevels[avatarId] = byRank;
  }

  const registered = Object.keys(PLAYER_PROPERTY_SEMANTICS).sort();
  const actual = [...discovered].sort();
  if (JSON.stringify(actual) !== JSON.stringify(registered))
    throw new Error(
      `[player-runtime/property] registry mismatch registered=${registered.join(',')} actual=${actual.join(',')}`
    );

  return {
    schemaVersion: 1,
    propertyTypes: actual,
    avatarPromotions,
    lightConePromotions,
    lightConeAbilities,
    relics,
    relicMainAffixes,
    relicSubAffixes,
    relicSets,
    traces,
    eidolonSkillLevels
  };
}

export { assertPlayerRuntimeData };
