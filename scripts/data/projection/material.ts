import type { MaterialCatalog } from '../../../src/lib/domain/training/types.js';
import type { MaterialDomain } from '../domain/training.js';
import type { TextResolver } from '../localization.js';
import type { Locale } from '../locale-registry.js';
import { requiredText } from './shared.js';

export function projectMaterials(
  materials: MaterialDomain[],
  locale: Locale,
  resolver: TextResolver
): MaterialCatalog {
  return {
    schemaVersion: 1,
    locale,
    materials: materials.map(({ nameSource, ...identity }) => ({
      ...identity,
      name: requiredText(resolver, nameSource, {
        domain: 'material',
        entityId: identity.id,
        field: 'name'
      })
    }))
  };
}
