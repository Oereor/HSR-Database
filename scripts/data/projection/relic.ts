import type { RelicSetDomain } from '../../../src/lib/domain/neutral.js';
import type { RelicView } from '../../../src/lib/domain/views.js';
import type { RelicSlot } from '../../../src/lib/domain/types.js';
import type { TextResolver } from '../localization.js';
import type { Locale } from '../locale-registry.js';
import { optionalText, requiredText } from './shared.js';

export interface RelicProjectionContext {
  locale: Locale;
  resolver: TextResolver;
  categoryLabels: Record<'cavern' | 'planar', string>;
  formatEffectSummary: (required: 2 | 4, description: string) => string;
}

export function projectRelic(domain: RelicSetDomain, context: RelicProjectionContext): RelicView {
  const field = (name: string) => ({ domain: 'relic', entityId: domain.id, field: name });
  const name = requiredText(context.resolver, domain.nameSource, field('name'));
  const effects = domain.effects.map((effect) => {
    if (!effect.descriptionSource) {
      context.resolver.recordAbsent(
        { entity: 'relic', id: domain.id, field: `effect.${effect.required}.description` },
        {
          requirement: 'required',
          visibility: 'emitted',
          fallbackUsed: false,
          productRouteReachability: 'reachable'
        }
      );
      throw new Error(`[relic.${domain.id}.effect.${effect.required}] localization absent`);
    }
    const result = context.resolver.projectGameText(effect.descriptionSource, {
      provenance: {
        entity: 'relic',
        id: domain.id,
        field: `effect.${effect.required}.description`
      },
      diagnosticDisposition: {
        requirement: 'required',
        visibility: 'emitted',
        fallbackUsed: false,
        productRouteReachability: 'reachable'
      }
    });
    if (result.status !== 'available')
      throw new Error(
        `[relic.${domain.id}.effect.${effect.required}] localization ${result.status}`
      );
    return {
      required: effect.required,
      description: result.value.text,
      descriptionTokens: result.value.tokens
    };
  });
  return {
    id: domain.id,
    name,
    description: effects
      .map((effect) => context.formatEffectSummary(effect.required, effect.description))
      .join(' '),
    version: domain.releaseVersion,
    category: domain.category,
    effectRequirements: effects.map((effect) => effect.required),
    type: domain.category,
    typeName: context.categoryLabels[domain.category],
    kind: 'relic',
    effects,
    pieces: domain.pieces.map((piece) => {
      const slot = piece.slot as RelicSlot;
      const pieceName = optionalText(
        context.resolver,
        piece.nameSource,
        field(`piece.${piece.id}.name`)
      );
      return {
        id: piece.id,
        slot,
        name:
          pieceName ||
          `${name}·${requiredText(context.resolver, piece.slotNameSource, field(`piece.${piece.id}.slotName`))}`,
        description: optionalText(
          context.resolver,
          piece.descriptionSource,
          field(`piece.${piece.id}.description`)
        )
      };
    }),
    sources: domain.sourceLabelSources
      .map((source, index) => optionalText(context.resolver, source, field(`source.${index}`)))
      .filter(Boolean)
  };
}
