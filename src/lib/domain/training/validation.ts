import type {
  CharacterTrainingData,
  LightConeTrainingData,
  MaterialCatalog,
  MaterialIdentity,
  TrainingSharedData
} from './types.js';
import {
  calculateCharacterTrainingTarget,
  calculateLightConeTrainingTarget,
  createDefaultCharacterTrainingTarget,
  derivePromotion,
  mergeCosts,
  requiredExp,
  trainingId,
  trainingInteger,
  TrainingError,
  validatePromotionChain,
  validateTrainingProfile,
  TRAINING_CREDIT_ITEM_ID
} from './index.js';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function schema(value: unknown): void {
  if (!record(value) || value.schemaVersion !== 1)
    throw new TrainingError('unsupported-schema', 'training');
}

function materialList(value: unknown): asserts value is MaterialIdentity[] {
  if (!Array.isArray(value)) throw new TrainingError('invalid-materials', 'materials');
  const seen = new Set<string>();
  for (const material of value) {
    if (!record(material)) throw new TrainingError('invalid-material', 'material');
    const id = trainingId(material.id as string);
    if (seen.has(id)) throw new TrainingError('duplicate-material', id);
    seen.add(id);
    for (const field of ['mainType', 'subType', 'rarity', 'iconKey'])
      if (typeof material[field] !== 'string' || !material[field])
        throw new TrainingError('invalid-material-metadata', `${id}.${field}`);
    if (material.iconKey !== id) throw new TrainingError('invalid-material-icon-key', id);
  }
}

export function assertTrainingSharedData(value: unknown): asserts value is TrainingSharedData {
  schema(value);
  const data = value as TrainingSharedData;
  materialList(data.materials);
  for (const groups of [data.characterExp, data.lightConeExp]) {
    if (!record(groups)) throw new TrainingError('invalid-exp-groups', 'EXP');
    for (const [group, exp] of Object.entries(groups)) {
      trainingId(group);
      if (!Array.isArray(exp) || !exp.length) throw new TrainingError('missing-exp-chain', group);
      requiredExp(exp, exp.length + 1);
    }
  }
  const materialIds = new Set(data.materials.map((material) => material.id));
  for (const items of [data.characterExpItems, data.lightConeExpItems]) {
    if (!Array.isArray(items) || !items.length) throw new TrainingError('invalid-exp-items', 'EXP');
    const seen = new Set<string>();
    for (const item of items) {
      trainingId(item.itemId);
      trainingInteger(item.exp, item.itemId, 1);
      if (!materialIds.has(item.itemId) || seen.has(item.itemId))
        throw new TrainingError('invalid-exp-item', item.itemId);
      seen.add(item.itemId);
    }
  }
  data.lightConeExpItems.forEach((item) => trainingInteger(item.creditCost, item.itemId));
  trainingInteger(data.characterExpCreditDivisor, 'characterExpCreditDivisor', 1);
}

export function assertCharacterTrainingData(
  value: unknown
): asserts value is CharacterTrainingData {
  schema(value);
  const data = value as CharacterTrainingData;
  trainingId(data.avatarId);
  trainingId(data.expGroup);
  validatePromotionChain(data.promotions);
  if (!Array.isArray(data.profiles) || !data.profiles.length)
    throw new TrainingError('missing-profiles', data.avatarId);
  const seen = new Set<number>();
  for (const profile of data.profiles) {
    validateTrainingProfile(profile);
    if (profile.avatarId !== data.avatarId || seen.has(profile.enhancedId))
      throw new TrainingError('profile-key-mismatch', data.avatarId);
    seen.add(profile.enhancedId);
    for (const node of profile.nodes)
      for (const step of node.steps)
        if (step.requiredPromotion >= data.promotions.length)
          throw new TrainingError('promotion-limit-out-of-range', node.key);
  }
  if (!seen.has(0)) throw new TrainingError('missing-base-profile', data.avatarId);
}

export function assertLightConeTrainingData(
  value: unknown
): asserts value is LightConeTrainingData {
  schema(value);
  const data = value as LightConeTrainingData;
  trainingId(data.equipmentId);
  trainingId(data.expGroup);
  validatePromotionChain(data.promotions);
}

export function assertMaterialCatalog(
  value: unknown,
  locale?: 'zh-CN' | 'en'
): asserts value is MaterialCatalog {
  schema(value);
  const data = value as MaterialCatalog;
  if (!['zh-CN', 'en'].includes(data.locale) || (locale !== undefined && locale !== data.locale))
    throw new TrainingError('material-locale-mismatch', String(data.locale));
  materialList(data.materials);
  for (const material of data.materials)
    if (typeof material.name !== 'string' || !material.name.trim())
      throw new TrainingError('missing-material-name', material.id);
}

export interface TrainingBundle {
  shared: TrainingSharedData;
  characters: CharacterTrainingData[];
  lightCones: LightConeTrainingData[];
}

export function validateTrainingBundle(
  bundle: TrainingBundle,
  catalogs: MaterialCatalog[] = []
): void {
  assertTrainingSharedData(bundle.shared);
  const ids = new Set(bundle.shared.materials.map((material) => material.id));
  const referenced = new Set([
    TRAINING_CREDIT_ITEM_ID,
    ...[...bundle.shared.characterExpItems, ...bundle.shared.lightConeExpItems].map(
      (item) => item.itemId
    )
  ]);
  const checkCost = (cost: Record<string, number>): void => {
    for (const id of Object.keys(mergeCosts(cost))) {
      if (!ids.has(id)) throw new TrainingError('missing-material-reference', id);
      referenced.add(id);
    }
  };
  const characters = new Set<string>();
  const lightCones = new Set<string>();
  for (const data of bundle.characters) {
    assertCharacterTrainingData(data);
    if (characters.has(data.avatarId))
      throw new TrainingError('duplicate-character', data.avatarId);
    characters.add(data.avatarId);
    data.promotions.forEach((stage) => checkCost(stage.cost));
    for (const profile of data.profiles) {
      profile.nodes.forEach((node) => node.steps.forEach((step) => checkCost(step.cost)));
      const result = calculateCharacterTrainingTarget(
        data,
        bundle.shared,
        createDefaultCharacterTrainingTarget(data, profile.enhancedId)
      );
      checkCost(result.totalCost);
    }
  }
  for (const data of bundle.lightCones) {
    assertLightConeTrainingData(data);
    if (lightCones.has(data.equipmentId))
      throw new TrainingError('duplicate-equipment', data.equipmentId);
    lightCones.add(data.equipmentId);
    data.promotions.forEach((stage) => checkCost(stage.cost));
    const level = data.promotions.at(-1)!.maxLevel;
    derivePromotion(data.promotions, level);
    const result = calculateLightConeTrainingTarget(data, bundle.shared, {
      equipmentId: data.equipmentId,
      level
    });
    checkCost(result.totalCost);
  }
  if (ids.size !== referenced.size || [...ids].some((id) => !referenced.has(id)))
    throw new TrainingError('unused-material', 'material inventory');
  const locales = new Set<string>();
  for (const catalog of catalogs) {
    assertMaterialCatalog(catalog);
    if (locales.has(catalog.locale))
      throw new TrainingError('duplicate-material-locale', catalog.locale);
    locales.add(catalog.locale);
    const identities = catalog.materials.map((material) => ({
      id: material.id,
      mainType: material.mainType,
      subType: material.subType,
      rarity: material.rarity,
      iconKey: material.iconKey
    }));
    if (JSON.stringify(identities) !== JSON.stringify(bundle.shared.materials))
      throw new TrainingError('material-projection-mismatch', catalog.locale);
  }
}
