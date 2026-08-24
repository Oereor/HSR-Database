import type {
  AvatarEquipmentRecommendation,
  CatalogEntry,
  RelicCatalogEntry,
  RelicProperty
} from './types.js';

export interface EquipmentRecommendationMainStatView {
  slot: AvatarEquipmentRecommendation['mainStatOptions'][number]['slot'];
  properties: RelicProperty[];
}

export interface EquipmentRecommendationView {
  lightCones: CatalogEntry[];
  cavernSets: RelicCatalogEntry[];
  planarSets: RelicCatalogEntry[];
  mainStats: EquipmentRecommendationMainStatView[];
  subStats: RelicProperty[];
}

function resolveOrdered<T>(
  ids: string[],
  values: T[],
  idOf: (value: T) => string,
  label: string
): T[] {
  const byId = new Map(values.map((value) => [idOf(value), value]));
  return ids.map((id) => {
    const value = byId.get(id);
    if (!value) throw new Error(`装备推荐无法解析${label}引用：${id}`);
    return value;
  });
}

export function resolveEquipmentRecommendation(
  recommendation: AvatarEquipmentRecommendation,
  lightCones: CatalogEntry[],
  relicSets: RelicCatalogEntry[],
  relicProperties: RelicProperty[]
): EquipmentRecommendationView {
  const propertiesByType = new Map(
    relicProperties.map((property) => [property.propertyType, property])
  );
  const resolveProperties = (propertyTypes: string[]): RelicProperty[] =>
    propertyTypes.map((propertyType) => {
      const property = propertiesByType.get(propertyType);
      if (!property) throw new Error(`装备推荐无法解析遗器属性引用：${propertyType}`);
      return property;
    });

  return {
    lightCones: resolveOrdered(
      recommendation.lightConeIds,
      lightCones,
      (entry) => entry.id,
      '光锥'
    ),
    cavernSets: resolveOrdered(recommendation.cavernSetIds, relicSets, (entry) => entry.id, '遗器'),
    planarSets: resolveOrdered(recommendation.planarSetIds, relicSets, (entry) => entry.id, '遗器'),
    mainStats: recommendation.mainStatOptions.map((option) => ({
      slot: option.slot,
      properties: resolveProperties(option.propertyTypes)
    })),
    subStats: resolveProperties(recommendation.subStatPropertyTypes)
  };
}
