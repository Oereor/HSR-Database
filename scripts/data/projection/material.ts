import type {
  MaterialCatalog,
  MaterialDetailCatalog
} from '../../../src/lib/domain/training/types.js';
import type { MaterialDomain } from '../domain/training.js';
import type { TextResolver } from '../localization.js';
import type { Locale } from '../locale-registry.js';
import { optionalText, requiredText } from './shared.js';
import { projectWithTrailblazerText } from './trailblazer-text.js';

export function projectMaterials(
  materials: MaterialDomain[],
  locale: Locale,
  resolver: TextResolver
): MaterialCatalog {
  return {
    schemaVersion: 1,
    locale,
    materials: materials.map((material) => ({
      id: material.id,
      mainType: material.mainType,
      subType: material.subType,
      rarity: material.rarity,
      iconKey: material.iconKey,
      name: requiredText(resolver, material.nameSource, {
        domain: 'material',
        entityId: material.id,
        field: 'name'
      })
    }))
  };
}

export function projectMaterialDetails(
  materials: MaterialDomain[],
  locale: Locale,
  resolver: TextResolver,
  variants?: TextResolver
): MaterialDetailCatalog {
  return {
    schemaVersion: 1,
    locale,
    materials: materials.map((material) => {
      const project = (text: TextResolver) => {
        const description = optionalText(text, material.descriptionSource, {
          domain: 'material',
          entityId: material.id,
          field: 'description'
        });
        const backgroundDescription = optionalText(text, material.backgroundDescriptionSource, {
          domain: 'material',
          entityId: material.id,
          field: 'backgroundDescription'
        });
        return {
          id: material.id,
          ...(description.trim() ? { description } : {}),
          ...(backgroundDescription.trim() ? { backgroundDescription } : {})
        };
      };
      return variants ? projectWithTrailblazerText(resolver, variants, project) : project(resolver);
    })
  };
}
