import { parseCharacterDetailIconKey } from '../domain/character-detail-icons.js';
import type { RelicSlot } from '../domain/types.js';
import type { SearchLocale } from '../domain/search-index.js';
import type { PlayerEquipmentCatalog, PlayerLightConeDetails } from './equipment.js';

const RELIC_SLOTS = new Set<RelicSlot>(['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT']);
const BASE_STATS = ['hp', 'attack', 'defence'] as const;
const DESCRIPTION_TYPES = new Set(['text', 'scaling-value', 'fixed-param', 'icon', 'interaction']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parsePlayerLightConeDetails(
  value: unknown,
  locale: SearchLocale,
  id: string
): PlayerLightConeDetails {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.locale !== locale ||
    value.id !== id ||
    !/^\d+$/.test(id)
  )
    throw new Error('Player Light Cone details identity is invalid');

  const { baseStats, passive } = value;
  if (
    !isRecord(baseStats) ||
    !Number.isSafeInteger(baseStats.minLevel) ||
    !Number.isSafeInteger(baseStats.maxLevel) ||
    !Number.isSafeInteger(baseStats.defaultLevel) ||
    !Array.isArray(baseStats.stages) ||
    baseStats.stages.some(
      (stage) =>
        !isRecord(stage) ||
        !Number.isSafeInteger(stage.fromLevel) ||
        !Number.isSafeInteger(stage.toLevel) ||
        BASE_STATS.some((key) => {
          const growth = stage[key];
          return (
            !isRecord(growth) || !Number.isFinite(growth.base) || !Number.isFinite(growth.perLevel)
          );
        })
    ) ||
    (baseStats.iconKeys !== undefined &&
      (!isRecord(baseStats.iconKeys) ||
        Object.values(baseStats.iconKeys).some(
          (key) => typeof key !== 'string' || !parseCharacterDetailIconKey(key)
        )))
  )
    throw new Error('Player Light Cone base stats are invalid');

  if (
    !isRecord(passive) ||
    typeof passive.id !== 'string' ||
    typeof passive.name !== 'string' ||
    !isRecord(passive.superimposition) ||
    !Array.isArray(passive.superimposition.scalingParamIndexes) ||
    !passive.superimposition.scalingParamIndexes.every(Number.isSafeInteger) ||
    !Array.isArray(passive.superimposition.levels) ||
    passive.superimposition.levels.some(
      (rank) =>
        !isRecord(rank) ||
        !Number.isSafeInteger(rank.level) ||
        typeof rank.description !== 'string' ||
        !Array.isArray(rank.descriptionTokens) ||
        rank.descriptionTokens.some(
          (token) =>
            !isRecord(token) ||
            typeof token.type !== 'string' ||
            !DESCRIPTION_TYPES.has(token.type) ||
            typeof token.value !== 'string'
        )
    ) ||
    !isOptionalString(value.pathMismatchWarning)
  )
    throw new Error('Player Light Cone effect is invalid');

  return value as unknown as PlayerLightConeDetails;
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
  const client = createEquipmentArtifactClient<PlayerEquipmentCatalog>(fetchImpl);
  return {
    load: (locale) =>
      client.load(`/generated/${locale}/player-equipment.json`, (value) =>
        parsePlayerEquipmentCatalog(value, locale)
      ),
    clear: client.clear
  };
}

function createEquipmentArtifactClient<T>(fetchImpl: typeof fetch) {
  const cache = new Map<string, Promise<T>>();
  return {
    load(url: string, parse: (value: unknown) => T): Promise<T> {
      const cached = cache.get(url);
      if (cached) return cached;
      const pending = fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Player equipment request failed: ${response.status}`);
          return parse(await response.json());
        })
        .catch((error: unknown) => {
          if (cache.get(url) === pending) cache.delete(url);
          throw error;
        });
      cache.set(url, pending);
      return pending;
    },
    clear: () => cache.clear()
  };
}

export function createPlayerLightConeDetailsClient(fetchImpl: typeof fetch = globalThis.fetch) {
  const client = createEquipmentArtifactClient<PlayerLightConeDetails>(fetchImpl);
  return {
    load(locale: SearchLocale, id: string): Promise<PlayerLightConeDetails> {
      if (!/^\d+$/.test(id)) return Promise.reject(new Error('Player Light Cone ID is invalid'));
      return client.load(`/generated/${locale}/player-light-cones/${id}.json`, (value) =>
        parsePlayerLightConeDetails(value, locale, id)
      );
    }
  };
}

const defaultClient = createPlayerEquipmentCatalogClient();
const lightConeDetailsClient = createPlayerLightConeDetailsClient();

export const loadPlayerEquipmentCatalog = (locale: SearchLocale): Promise<PlayerEquipmentCatalog> =>
  defaultClient.load(locale);

export const loadPlayerLightConeDetails = lightConeDetailsClient.load;
