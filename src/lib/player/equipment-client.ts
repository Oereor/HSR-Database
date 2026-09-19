import type { RelicSlot } from '$lib/domain/types';
import type { SearchLocale } from '$lib/domain/search-index';
import type { PlayerEquipmentCatalog } from './equipment.js';

const RELIC_SLOTS = new Set<RelicSlot>(['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function parsePlayerEquipmentCatalog(
  value: unknown,
  locale: SearchLocale
): PlayerEquipmentCatalog {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.locale !== locale ||
    !Array.isArray(value.lightCones) ||
    !Array.isArray(value.relicSets)
  )
    throw new Error('Player equipment catalog identity is invalid');

  for (const lightCone of value.lightCones) {
    if (
      !isRecord(lightCone) ||
      typeof lightCone.id !== 'string' ||
      typeof lightCone.name !== 'string' ||
      (lightCone.rarity !== undefined && !Number.isSafeInteger(lightCone.rarity)) ||
      !isOptionalString(lightCone.path) ||
      !isOptionalString(lightCone.pathName)
    )
      throw new Error('Player equipment Light Cone metadata is invalid');
  }
  for (const relicSet of value.relicSets) {
    if (
      !isRecord(relicSet) ||
      typeof relicSet.id !== 'string' ||
      typeof relicSet.name !== 'string' ||
      !Array.isArray(relicSet.pieces)
    )
      throw new Error('Player equipment Relic Set metadata is invalid');
    for (const piece of relicSet.pieces)
      if (
        !isRecord(piece) ||
        typeof piece.id !== 'string' ||
        typeof piece.name !== 'string' ||
        typeof piece.slot !== 'string' ||
        !RELIC_SLOTS.has(piece.slot as RelicSlot)
      )
        throw new Error('Player equipment Relic piece metadata is invalid');
  }
  return value as unknown as PlayerEquipmentCatalog;
}

export interface PlayerEquipmentCatalogClient {
  load(locale: SearchLocale): Promise<PlayerEquipmentCatalog>;
  clear(): void;
}

export function createPlayerEquipmentCatalogClient(
  fetchImpl: typeof fetch = globalThis.fetch
): PlayerEquipmentCatalogClient {
  const cache = new Map<SearchLocale, Promise<PlayerEquipmentCatalog>>();
  return {
    load(locale) {
      let pending = cache.get(locale);
      if (!pending) {
        pending = fetchImpl(`/generated/${locale}/player-equipment.json`, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        })
          .then(async (response) => {
            if (!response.ok)
              throw new Error(`Player equipment catalog failed: ${response.status}`);
            return parsePlayerEquipmentCatalog(await response.json(), locale);
          })
          .catch((error: unknown) => {
            cache.delete(locale);
            throw error;
          });
        cache.set(locale, pending);
      }
      return pending;
    },
    clear: () => cache.clear()
  };
}

const defaultClient = createPlayerEquipmentCatalogClient();

export const loadPlayerEquipmentCatalog = (locale: SearchLocale): Promise<PlayerEquipmentCatalog> =>
  defaultClient.load(locale);
