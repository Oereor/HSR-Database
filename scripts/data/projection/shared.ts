import { normalizeGameText } from '../../../src/lib/domain/game-text.js';
import type { LevelledDescription } from '../../../src/lib/domain/types.js';
import type { NeutralSkillLevel, NeutralTextSource } from '../../../src/lib/domain/neutral.js';
import type { LocalizationResult, TextResolver } from '../localization.js';

export interface ProjectionField {
  domain: string;
  entityId: string;
  field: string;
}

function failure(
  result: Exclude<LocalizationResult<unknown>, { status: 'available' }>,
  field: ProjectionField
): Error {
  const ref = 'ref' in result && result.ref ? JSON.stringify(result.ref) : 'none';
  const reason = 'reason' in result ? `: ${result.reason}` : '';
  return new Error(
    `[${field.domain}.${field.entityId}.${field.field}] localization ${result.status} (ref=${ref})${reason}`
  );
}

export function requiredText(
  resolver: TextResolver,
  source: NeutralTextSource | undefined,
  field: ProjectionField
): string {
  if (!source) {
    resolver.recordAbsent(
      { entity: field.domain, id: field.entityId, field: field.field },
      {
        requirement: 'required',
        visibility: 'emitted',
        fallbackUsed: false,
        productRouteReachability: 'reachable'
      }
    );
    throw failure({ status: 'absent' }, field);
  }
  const result = resolver.resolve(source, {
    provenance: { entity: field.domain, id: field.entityId, field: field.field },
    diagnosticDisposition: {
      requirement: 'required',
      visibility: 'emitted',
      fallbackUsed: false,
      productRouteReachability: 'reachable'
    }
  });
  if (result.status === 'available') return normalizeGameText(result.value);
  throw failure(result, field);
}

export function optionalText(
  resolver: TextResolver,
  source: NeutralTextSource | undefined,
  field: ProjectionField
): string {
  if (!source) {
    resolver.recordAbsent(
      { entity: field.domain, id: field.entityId, field: field.field },
      {
        requirement: 'optional',
        visibility: 'hidden',
        fallbackUsed: true,
        productRouteReachability: 'reachable'
      }
    );
    return '';
  }
  const result = resolver.resolve(source, {
    provenance: { entity: field.domain, id: field.entityId, field: field.field },
    diagnosticDisposition: {
      requirement: 'optional',
      visibility: 'hidden',
      fallbackUsed: true,
      productRouteReachability: 'reachable'
    }
  });
  if (result.status === 'available') return normalizeGameText(result.value);
  if (result.status === 'empty' || result.status === 'missing') return '';
  throw failure(result, field);
}

export function projectLevels(
  resolver: TextResolver,
  levels: readonly NeutralSkillLevel[],
  field: Omit<ProjectionField, 'field'>,
  textContext: { gender?: 'female' | 'male'; nickname?: string } = {}
): { scalingParamIndexes: number[]; levels: LevelledDescription[] } {
  const parameterCount = Math.max(0, ...levels.map((level) => level.params.length));
  const scalingParamIndexes = Array.from({ length: parameterCount }, (_, index) => index).filter(
    (index) => {
      const values = levels
        .map((level) => level.params[index])
        .filter((value) => value !== undefined);
      return values.length >= 2 && values.some((value) => value !== values[0]);
    }
  );
  const scaling = new Set(scalingParamIndexes);
  return {
    scalingParamIndexes,
    levels: [...levels]
      .sort((a, b) => a.level - b.level)
      .map((level) => {
        if (!level.descriptionSource) {
          resolver.recordAbsent(
            { entity: field.domain, id: field.entityId, field: `level.${level.level}.description` },
            {
              requirement: 'required',
              visibility: 'emitted',
              fallbackUsed: false,
              productRouteReachability: 'reachable'
            }
          );
          throw failure(
            { status: 'absent' },
            { ...field, field: `level.${level.level}.description` }
          );
        }
        const result = resolver.projectGameText(level.descriptionSource, {
          ...textContext,
          scalingParamIndexes: scaling,
          provenance: {
            entity: field.domain,
            id: field.entityId,
            field: `level.${level.level}.description`
          },
          diagnosticDisposition: {
            requirement: 'required',
            visibility: 'emitted',
            fallbackUsed: false,
            productRouteReachability: 'reachable'
          }
        });
        if (result.status !== 'available')
          throw failure(result, { ...field, field: `level.${level.level}.description` });
        return {
          level: level.level,
          description: result.value.text,
          descriptionTokens: result.value.tokens
        };
      })
  };
}
