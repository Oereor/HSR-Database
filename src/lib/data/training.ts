import type {
  CharacterTrainingData,
  LightConeTrainingData,
  MaterialCatalog,
  TrainingSharedData
} from '../domain/training/types.js';
import { trainingId, TrainingError } from '../domain/training/index.js';
import {
  assertCharacterTrainingData,
  assertLightConeTrainingData,
  assertMaterialCatalog,
  assertTrainingSharedData
} from '../domain/training/validation.js';

/** Independent of page loaders. Create one instance per consumer/request context. */
export function createTrainingLoader(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, Promise<unknown>>();
  function load<T>(url: string, validate: (value: unknown) => void): Promise<T> {
    let pending = cache.get(url);
    if (!pending) {
      pending = (async () => {
        const response = await fetcher(url);
        if (!response.ok) throw new TrainingError('load-failed', `${url}:${response.status}`);
        const value: unknown = await response.json();
        validate(value);
        return value;
      })().catch((error: unknown) => {
        cache.delete(url);
        throw error;
      });
      cache.set(url, pending);
    }
    return pending as Promise<T>;
  }
  return {
    loadShared: () =>
      load<TrainingSharedData>('/generated/training/shared.json', assertTrainingSharedData),
    loadCharacter: (avatarId: string) =>
      load<CharacterTrainingData>(
        `/generated/training/characters/${trainingId(avatarId)}.json`,
        (value) => {
          assertCharacterTrainingData(value);
          if (value.avatarId !== avatarId) throw new TrainingError('avatar-mismatch', avatarId);
        }
      ),
    loadLightCone: (equipmentId: string) =>
      load<LightConeTrainingData>(
        `/generated/training/light-cones/${trainingId(equipmentId)}.json`,
        (value) => {
          assertLightConeTrainingData(value);
          if (value.equipmentId !== equipmentId)
            throw new TrainingError('equipment-mismatch', equipmentId);
        }
      ),
    loadMaterials: (locale: 'zh-CN' | 'en') => {
      if (!['zh-CN', 'en'].includes(locale)) throw new TrainingError('invalid-locale', locale);
      return load<MaterialCatalog>(`/generated/${locale}/materials.json`, (value) =>
        assertMaterialCatalog(value, locale)
      );
    }
  };
}
