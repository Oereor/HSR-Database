import type { CharacterDomain, NeutralTextSource } from '../../../src/lib/domain/neutral.js';
import type {
  CharacterTrainingData,
  LightConeTrainingData,
  MaterialIdentity,
  PromotionCostStage,
  TrainingNode,
  TrainingSharedData
} from '../../../src/lib/domain/training/types.js';
import {
  mergeCosts,
  progressionKey,
  trainingId,
  trainingInteger
} from '../../../src/lib/domain/training/index.js';
import { validateTrainingBundle } from '../../../src/lib/domain/training/validation.js';
import { rows, textSource } from './shared.js';

export { TRAINING_TABLE_NAMES } from '../training-sources.js';

export interface MaterialDomain extends MaterialIdentity {
  nameSource?: NeutralTextSource;
  descriptionSource?: NeutralTextSource;
  backgroundDescriptionSource?: NeutralTextSource;
}

export interface TrainingDomainBuild {
  shared: TrainingSharedData;
  characters: CharacterTrainingData[];
  lightCones: LightConeTrainingData[];
  materials: MaterialDomain[];
}

type Raw = Record<string, unknown>;
const number = (value: unknown, identity: string, minimum = 0): number => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value)))
    throw new Error(`[training/source] invalid numeric field ${identity}`);
  return trainingInteger(Number(value), identity, minimum);
};
const id = (value: unknown): string => trainingId(String(value));
const ids = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new Error('[training/source] missing ID list');
  return value.map(id);
};
const cost = (value: unknown): Record<string, number> => {
  if (!Array.isArray(value)) throw new Error('[training/source] missing material list');
  return mergeCosts(
    ...value.map((entry) => {
      const row = entry as Raw;
      return { [id(row.ItemID)]: number(row.ItemNum, 'ItemNum', 1) };
    })
  );
};
const sortIds = (a: { id: string }, b: { id: string }): number =>
  a.id.localeCompare(b.id, 'en', { numeric: true });

function promotions(source: Raw[], ownerField: string, ownerId: string): PromotionCostStage[] {
  return source
    .filter((row) => String(row[ownerField]) === ownerId)
    .map((row) => ({
      promotion: number(row.Promotion ?? 0, 'Promotion'),
      maxLevel: number(row.MaxLevel, 'MaxLevel', 1),
      cost: cost(row.PromotionCostList)
    }))
    .sort((a, b) => a.promotion - b.promotion);
}

function expGroups(
  source: Raw[],
  field: string,
  maxima: Map<string, number>
): Record<string, number[]> {
  return Object.fromEntries(
    [...maxima.entries()].sort().map(([group, maxLevel]) => {
      const groupRows = source.filter((row) => String(row[field]) === group);
      const byLevel = new Map<number, Raw>();
      for (const row of groupRows) {
        const level = number(row.Level, 'EXP Level', 1);
        if (byLevel.has(level))
          throw new Error(`[training/source] duplicate EXP ${group}:${level}`);
        byLevel.set(level, row);
      }
      const exp = Array.from({ length: maxLevel - 1 }, (_, index) => {
        const row = byLevel.get(index + 1);
        if (!row || row.Exp === undefined)
          throw new Error(`[training/source] missing EXP ${group}:${index + 1}`);
        return number(row.Exp, `EXP ${group}:${index + 1}`, 1);
      });
      return [group, exp];
    })
  );
}

export function buildTrainingDomain(
  tables: Record<string, unknown>,
  characterDomains: CharacterDomain[]
): TrainingDomainBuild {
  const avatars = new Map(rows(tables, 'AvatarConfig').map((row) => [id(row.AvatarID), row]));
  const enhanced = new Map(
    rows(tables, 'AvatarConfigEnhanced').map((row) => [
      id(row.AvatarID),
      number(row.EnhancedID, 'EnhancedID', 1)
    ])
  );
  const treeRows = rows(tables, 'AvatarSkillTreeConfig');
  const referencedIds = new Set<string>();
  const rememberCost = (value: Record<string, number>): void => {
    for (const key of Object.keys(value)) referencedIds.add(key);
  };
  const characters: CharacterTrainingData[] = characterDomains.map((character) => {
    const avatar = avatars.get(character.id);
    if (!avatar) throw new Error(`[training/source] missing AvatarConfig ${character.id}`);
    const chain = promotions(rows(tables, 'AvatarPromotionConfig'), 'AvatarID', character.id);
    if (chain.length !== number(avatar.MaxPromotion, 'MaxPromotion') + 1)
      throw new Error(`[training/source] incomplete promotion ${character.id}`);
    chain.forEach((stage) => rememberCost(stage.cost));
    const profiles = Object.entries(character.profiles).flatMap(([profileName, profile]) => {
      if (!profile) return [];
      const enhancedId = profileName === 'base' ? 0 : enhanced.get(character.id);
      if (enhancedId === undefined)
        throw new Error(`[training/source] missing EnhancedID ${character.id}`);
      const groups = new Map<string, Raw[]>();
      for (const row of treeRows)
        if (
          String(row.AvatarID) === character.id &&
          number(row.EnhancedID ?? 0, 'EnhancedID') === enhancedId
        ) {
          const pointId = id(row.PointID);
          groups.set(pointId, [...(groups.get(pointId) ?? []), row]);
        }
      const nodes: TrainingNode[] = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
        .map(([pointId, sourceRows]) => {
          const ordered = sourceRows.sort(
            (a, b) => number(a.Level ?? 1, 'Level') - number(b.Level ?? 1, 'Level')
          );
          const first = ordered[0];
          for (const row of ordered)
            for (const field of ['MaxLevel', 'PointType', 'PrePoint', 'LevelUpSkillID'])
              if (JSON.stringify(row[field]) !== JSON.stringify(first[field]))
                throw new Error(
                  `[training/source] inconsistent ${character.id}:${enhancedId}:${pointId} ${field}`
                );
          const steps = ordered.map((row) => ({
            level: number(row.Level ?? 1, 'Level', 1),
            requiredPromotion: number(row.AvatarPromotionLimit ?? 0, 'AvatarPromotionLimit'),
            cost: cost(row.MaterialList)
          }));
          steps.forEach((step) => rememberCost(step.cost));
          const maxLevel = number(first.MaxLevel ?? 1, 'MaxLevel', 1);
          const defaultUnlock = first.DefaultUnlock === true;
          const hasCost = steps.some((step) => Object.keys(step.cost).length > 0);
          const kind =
            maxLevel > 1 ? 'skill' : hasCost ? 'trace' : defaultUnlock ? 'default' : 'fixed';
          return {
            key: progressionKey(character.id, enhancedId, pointId),
            pointId,
            pointType: number(first.PointType, 'PointType', 1),
            kind,
            defaultUnlock,
            maxLevel,
            prerequisiteIds: ids(first.PrePoint),
            linkedSkillIds: ids(first.LevelUpSkillID),
            steps,
            bindings: profile.skills
              .filter(
                (skill) =>
                  skill.visibility !== 'hidden' &&
                  skill.source !== 'avatar-global-buff' &&
                  skill.progressionId === pointId
              )
              .map((skill) => ({
                skillId: skill.id,
                category: skill.category,
                source: skill.source as 'avatar' | 'memosprite',
                displayLevels: skill.levels.map((level) => level.level)
              }))
          };
        });
      return [{ avatarId: character.id, enhancedId, nodes }];
    });
    const expectedProfileIds = new Set(profiles.map((profile) => profile.enhancedId));
    if (
      treeRows.some(
        (row) =>
          String(row.AvatarID) === character.id &&
          !expectedProfileIds.has(number(row.EnhancedID ?? 0, 'EnhancedID'))
      )
    )
      throw new Error(`[training/source] orphan Profile ${character.id}`);
    return {
      schemaVersion: 1,
      avatarId: character.id,
      expGroup: id(avatar.ExpGroup),
      promotions: chain,
      profiles
    };
  });
  const lightCones: LightConeTrainingData[] = rows(tables, 'EquipmentConfig').map((equipment) => {
    const equipmentId = id(equipment.EquipmentID);
    const chain = promotions(rows(tables, 'EquipmentPromotionConfig'), 'EquipmentID', equipmentId);
    chain.forEach((stage) => rememberCost(stage.cost));
    if (chain.length !== number(equipment.MaxPromotion, 'MaxPromotion') + 1)
      throw new Error(`[training/source] incomplete promotion ${equipmentId}`);
    return { schemaVersion: 1, equipmentId, expGroup: id(equipment.ExpType), promotions: chain };
  });
  const characterExpItems = rows(tables, 'AvatarExpItemConfig').map((row) => ({
    itemId: id(row.ItemID),
    exp: number(row.Exp, 'Avatar EXP', 1)
  }));
  const lightConeExpItems = rows(tables, 'EquipmentExpItemConfig').map((row) => ({
    itemId: id(row.ItemID),
    exp: number(row.ExpProvide, 'Equipment EXP', 1),
    creditCost: number(row.CoinCost, 'CoinCost')
  }));
  [...characterExpItems, ...lightConeExpItems].forEach((item) => referencedIds.add(item.itemId));
  const itemRows = new Map<string, Raw>();
  for (const row of rows(tables, 'ItemConfig'))
    if (referencedIds.has(String(row.ID))) {
      const itemId = id(row.ID);
      if (itemRows.has(itemId)) throw new Error(`[training/source] duplicate ItemConfig ${itemId}`);
      itemRows.set(itemId, row);
    }
  const materials: MaterialDomain[] = [...referencedIds]
    .map((itemId) => {
      const row = itemRows.get(itemId);
      if (!row) throw new Error(`[training/source] missing ItemConfig ${itemId}`);
      for (const field of ['ItemMainType', 'ItemSubType', 'Rarity', 'ItemIconPath'])
        if (typeof row[field] !== 'string' || !row[field])
          throw new Error(`[training/source] missing ${itemId}.${field}`);
      return {
        id: itemId,
        mainType: String(row.ItemMainType),
        subType: String(row.ItemSubType),
        rarity: String(row.Rarity),
        iconKey: itemId,
        nameSource: textSource(row.ItemName),
        descriptionSource: textSource(row.ItemDesc),
        backgroundDescriptionSource: textSource(row.ItemBGDesc)
      };
    })
    .sort(sortIds);
  const constants = rows(tables, 'ConstValueCommon').filter(
    (row) => row.ConstValueName === 'Exp_SoftCoin_Cost'
  );
  if (constants.length !== 1)
    throw new Error('[training/source] missing/duplicate Exp_SoftCoin_Cost');
  const maxima = (
    entities: Array<{ expGroup: string; promotions: PromotionCostStage[] }>
  ): Map<string, number> => {
    const result = new Map<string, number>();
    for (const entity of entities)
      result.set(
        entity.expGroup,
        Math.max(result.get(entity.expGroup) ?? 0, entity.promotions.at(-1)?.maxLevel ?? 0)
      );
    return result;
  };
  const shared: TrainingSharedData = {
    schemaVersion: 1,
    characterExp: expGroups(rows(tables, 'ExpType'), 'TypeID', maxima(characters)),
    lightConeExp: expGroups(rows(tables, 'EquipmentExpType'), 'ExpType', maxima(lightCones)),
    materials: materials.map((material) => ({
      id: material.id,
      mainType: material.mainType,
      subType: material.subType,
      rarity: material.rarity,
      iconKey: material.iconKey
    })),
    characterExpItems,
    lightConeExpItems,
    characterExpCreditDivisor: number((constants[0].Value as Raw)?.IntValue, 'Exp_SoftCoin_Cost', 1)
  };
  const build = { shared, characters, lightCones, materials };
  validateTrainingBundle(build);
  return build;
}

export function auditTrainingDomain(build: TrainingDomainBuild) {
  const profiles = build.characters.flatMap((character) => character.profiles);
  const nodes = profiles.flatMap((profile) => profile.nodes);
  const sharedNodes = nodes.filter((node) => node.linkedSkillIds.length > 1);
  return {
    profiles: profiles.length,
    nodes: nodes.length,
    materialCount: build.materials.length,
    sharedNodes: sharedNodes.map((node) => ({
      key: node.key,
      linkedSkillIds: node.linkedSkillIds,
      bindings: node.bindings,
      crossCategory: new Set(node.bindings.map((binding) => binding.category)).size > 1,
      differentDisplayLevels:
        new Set(node.bindings.map((binding) => JSON.stringify(binding.displayLevels))).size > 1
    })),
    sharedPrerequisites: profiles.flatMap((profile) =>
      profile.nodes.flatMap((parent) => {
        const children = profile.nodes.filter((node) =>
          node.prerequisiteIds.includes(parent.pointId)
        );
        return children.length > 1
          ? [{ key: parent.key, children: children.map((node) => node.key) }]
          : [];
      })
    )
  };
}
