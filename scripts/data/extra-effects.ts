import type { ExtraEffect } from '../../src/lib/domain/types.js';
import { gameTextToPlain, normalizeGameText } from '../../src/lib/domain/game-text.js';
import type { TextSource } from './localization.js';
import { numberOf } from './raw.js';
import { formatGameMarkup, type DescriptionDiagnostic } from './text.js';

interface HashRef {
  Hash: string;
}

export interface ExtraEffectRow {
  ExtraEffectID?: unknown;
  ExtraEffectName?: HashRef;
  ExtraEffectDesc?: HashRef;
  DescParamList?: unknown[];
}

export interface ExtraEffectResolutionRequest {
  ownerEntity: string;
  ownerId: string;
  field: string;
}

export interface ExtraEffectResolverHooks {
  onUnresolved?(extraEffectId: string, source: TextSource): void;
  onNotDisplayReady?(extraEffectId: string, source: TextSource): void;
  onDescriptionDiagnostics?(
    extraEffectId: string,
    diagnostics: DescriptionDiagnostic[],
    source: TextSource
  ): void;
}

export interface ExtraEffectResolver {
  has(id: unknown): boolean;
  resolve(rawIds: readonly unknown[], request: ExtraEffectResolutionRequest): ExtraEffect[];
}

export function createExtraEffectResolver(
  rows: readonly ExtraEffectRow[],
  resolveText: (ref: unknown, source: TextSource) => string,
  hooks: ExtraEffectResolverHooks = {}
): ExtraEffectResolver {
  const byId = new Map<string, ExtraEffectRow>();
  for (const row of rows) {
    const id = String(row.ExtraEffectID);
    if (!id) throw new Error('ExtraEffectConfig 包含空 ExtraEffectID');
    if (byId.has(id)) throw new Error(`ExtraEffectConfig 存在重复 ExtraEffectID：${id}`);
    byId.set(id, row);
  }

  return {
    has: (id) => byId.has(String(id)),
    resolve(rawIds, request) {
      return rawIds.flatMap((rawId) => {
        const id = String(rawId);
        const relationSource: TextSource = {
          entity: request.ownerEntity,
          id: request.ownerId,
          field: request.field
        };
        const row = byId.get(id);
        if (!row) {
          hooks.onUnresolved?.(id, relationSource);
          return [];
        }
        const entity = `${request.ownerEntity}-extra-effect`;
        const descriptionSource: TextSource = {
          entity,
          id,
          field: 'ExtraEffectDesc'
        };
        const formatted = formatGameMarkup(
          resolveText(row.ExtraEffectDesc, descriptionSource),
          (row.DescParamList ?? []).map(numberOf)
        );
        hooks.onDescriptionDiagnostics?.(id, formatted.diagnostics, descriptionSource);
        const name = normalizeGameText(
          resolveText(row.ExtraEffectName, { entity, id, field: 'ExtraEffectName' })
        );
        if (!gameTextToPlain(name).trim() || !gameTextToPlain(formatted.text).trim()) {
          hooks.onNotDisplayReady?.(id, relationSource);
          return [];
        }
        return [{ id, name, description: formatted.text }];
      });
    }
  };
}
