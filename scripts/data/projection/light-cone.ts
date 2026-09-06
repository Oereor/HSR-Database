import type { LightConeDomain } from '../../../src/lib/domain/neutral.js';
import type { LightConeView } from '../../../src/lib/domain/views.js';
import type { TextResolver } from '../localization.js';
import type { Locale } from '../locale-registry.js';
import { optionalText, projectLevels, requiredText } from './shared.js';

export interface LightConeProjectionContext {
  locale: Locale;
  resolver: TextResolver;
}

export function projectLightCone(
  domain: LightConeDomain,
  context: LightConeProjectionContext
): LightConeView {
  const field = (name: string) => ({ domain: 'light-cone', entityId: domain.id, field: name });
  const itemName = optionalText(context.resolver, domain.itemNameSource, field('itemName'));
  const name = domain.nameSource
    ? requiredText(context.resolver, domain.nameSource, field('name'))
    : itemName;
  if (!name) throw new Error(`[light-cone.${domain.id}.name] localization absent`);
  return {
    id: domain.id,
    name,
    description: optionalText(context.resolver, domain.descriptionSource, field('description')),
    rarity: domain.rarity,
    path: domain.pathCode,
    pathName: requiredText(context.resolver, domain.pathNameSource, field('pathName')),
    kind: 'light-cone',
    story: optionalText(context.resolver, domain.storySource, field('story')),
    passive: {
      id: domain.passive.id,
      name: requiredText(context.resolver, domain.passive.nameSource, field('passive.name')),
      superimposition: projectLevels(context.resolver, domain.passive.levels, {
        domain: 'light-cone',
        entityId: domain.id
      })
    },
    baseStats: domain.stats
  };
}
