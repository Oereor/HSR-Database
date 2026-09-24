import type { AvatarEquipmentRecommendation } from '../domain/types.js';

export type RelicScoreRecommendation = Pick<
  AvatarEquipmentRecommendation,
  'avatarId' | 'cavernSetIds' | 'planarSetIds' | 'mainStatOptions' | 'subStatPropertyTypes'
>;
export type RelicScoreRecommendationIndex = Record<string, RelicScoreRecommendation>;

/** Locale-neutral projection of the existing AvatarRelicRecommend pipeline. */
export function assertRelicScoreRecommendations(
  value: unknown
): asserts value is RelicScoreRecommendationIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Relic score recommendation index must be an object');
  for (const [id, item] of Object.entries(value)) {
    if (!/^\d+$/.test(id) || !item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Relic score recommendation identity is invalid');
    const recommendation = item as Partial<RelicScoreRecommendation>;
    if (
      Object.keys(item).sort().join(',') !==
        'avatarId,cavernSetIds,mainStatOptions,planarSetIds,subStatPropertyTypes' ||
      recommendation.avatarId !== id ||
      !Array.isArray(recommendation.cavernSetIds) ||
      !recommendation.cavernSetIds.every((setId) => typeof setId === 'string') ||
      !Array.isArray(recommendation.planarSetIds) ||
      !recommendation.planarSetIds.every((setId) => typeof setId === 'string') ||
      !Array.isArray(recommendation.mainStatOptions) ||
      recommendation.mainStatOptions.length !== 4 ||
      new Set(recommendation.mainStatOptions.map((option) => option?.slot)).size !== 4 ||
      !Array.isArray(recommendation.subStatPropertyTypes) ||
      !recommendation.mainStatOptions.every(
        (option) =>
          option &&
          ['BODY', 'FOOT', 'NECK', 'OBJECT'].includes(option.slot) &&
          Array.isArray(option.propertyTypes) &&
          option.propertyTypes.every((property) => typeof property === 'string')
      ) ||
      !recommendation.subStatPropertyTypes.every((property) => typeof property === 'string')
    )
      throw new Error(`Relic score recommendation is invalid: ${id}`);
  }
}
