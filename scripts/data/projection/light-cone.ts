import type { LightConeDomain } from '../../../src/lib/domain/neutral.js';
import type { LightConeView } from '../../../src/lib/domain/views.js';
import { parseTextHash } from '../../../src/lib/domain/types.js';
import type { PlayerLightConeDetails } from '../../../src/lib/player/equipment.js';
import type { TextResolver } from '../localization.js';
import type { Locale } from '../locale-registry.js';
import { optionalText, projectLevels, requiredText } from './shared.js';

const PATH_MISMATCH_HASH = parseTextHash('15998603839633828117')!;

export function projectPlayerLightConeDetails(
  lightCones: readonly LightConeView[],
  { locale, resolver }: LightConeProjectionContext
): PlayerLightConeDetails[] {
  const warning = optionalText(
    resolver,
    { kind: 'direct', ref: { kind: 'hash', hash: PATH_MISMATCH_HASH } },
    { domain: 'player-equipment', entityId: 'light-cone', field: 'pathMismatchWarning' }
  );
  return lightCones.map(({ id, baseStats, passive, pathName }) => ({
    schemaVersion: 1,
    locale,
    id,
    baseStats,
    passive,
    ...(pathName && warning.includes('#1')
      ? { pathMismatchWarning: warning.replace('#1', () => pathName) }
      : {})
  }));
}

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
