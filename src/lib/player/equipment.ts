import type { EquipmentRecommendationView } from '../domain/equipment-recommendation-view.js';
import type { CatalogEntry, RelicProperty, RelicSet, RelicSlot } from '../domain/types.js';
import type { SearchLocale } from '../domain/search-index.js';
import type {
  PlayerLightCone,
  PlayerRelic,
  PlayerRelicAffix,
  PlayerRelicSubAffix
} from './contract.js';

export interface PlayerEquipmentLightConeMetadata {
  id: string;
  name: string;
  rarity?: number;
  path?: string;
  pathName?: string;
}

export interface PlayerEquipmentRelicSetMetadata {
  id: string;
  name: string;
  pieces: Array<{
    id: string;
    slot: RelicSlot;
    name: string;
  }>;
}

export interface PlayerEquipmentCatalog {
  schemaVersion: 1;
  locale: SearchLocale;
  lightCones: PlayerEquipmentLightConeMetadata[];
  relicSets: PlayerEquipmentRelicSetMetadata[];
}

export interface PlayerEquipmentCatalogIndex {
  lightCones: ReadonlyMap<string, PlayerEquipmentLightConeMetadata>;
  relicSets: ReadonlyMap<string, PlayerEquipmentRelicSetMetadata>;
  relicPieces: ReadonlyMap<
    string,
    ReadonlyMap<RelicSlot, PlayerEquipmentRelicSetMetadata['pieces'][number]>
  >;
}

export interface PlayerLightConeView {
  equipment: PlayerLightCone | null;
  metadata?: PlayerEquipmentLightConeMetadata;
}

export interface PlayerRelicAffixView {
  type: string;
  display: string;
  percent: boolean;
  count?: number;
  property?: RelicProperty;
  recommended: boolean;
}

export interface PlayerRelicSlotView {
  slot: RelicSlot;
  type: PlayerRelic['type'];
  relic: PlayerRelic | null;
  set?: PlayerEquipmentRelicSetMetadata;
  piece?: PlayerEquipmentRelicSetMetadata['pieces'][number];
  mainAffix: PlayerRelicAffixView | null;
  subAffixes: PlayerRelicAffixView[];
}

export const PLAYER_RELIC_SLOT_ORDER = [
  'HEAD',
  'HAND',
  'BODY',
  'FOOT',
  'NECK',
  'OBJECT'
] as const satisfies readonly RelicSlot[];

export const PLAYER_RELIC_TYPE_BY_SLOT = {
  HEAD: 1,
  HAND: 2,
  BODY: 3,
  FOOT: 4,
  NECK: 5,
  OBJECT: 6
} as const satisfies Record<RelicSlot, PlayerRelic['type']>;

const PLAYER_RELIC_SLOT_BY_TYPE = {
  1: 'HEAD',
  2: 'HAND',
  3: 'BODY',
  4: 'FOOT',
  5: 'NECK',
  6: 'OBJECT'
} as const satisfies Record<PlayerRelic['type'], RelicSlot>;

export function playerRelicSlot(type: PlayerRelic['type']): RelicSlot {
  return PLAYER_RELIC_SLOT_BY_TYPE[type];
}

export function buildPlayerEquipmentCatalog(
  locale: SearchLocale,
  lightCones: CatalogEntry[],
  relicSets: RelicSet[]
): PlayerEquipmentCatalog {
  return {
    schemaVersion: 1,
    locale,
    lightCones: lightCones.map(({ id, name, rarity, path, pathName }) => ({
      id,
      name,
      ...(rarity === undefined ? {} : { rarity }),
      ...(path === undefined ? {} : { path }),
      ...(pathName === undefined ? {} : { pathName })
    })),
    relicSets: relicSets.map(({ id, name, pieces }) => ({
      id,
      name,
      pieces: pieces.map(({ id: pieceId, slot, name: pieceName }) => ({
        id: pieceId,
        slot,
        name: pieceName
      }))
    }))
  };
}

export function createPlayerEquipmentCatalogIndex(
  catalog: PlayerEquipmentCatalog
): PlayerEquipmentCatalogIndex {
  const relicPieces = new Map<
    string,
    ReadonlyMap<RelicSlot, PlayerEquipmentRelicSetMetadata['pieces'][number]>
  >();
  for (const set of catalog.relicSets) {
    const pieces = new Map<RelicSlot, PlayerEquipmentRelicSetMetadata['pieces'][number]>();
    for (const piece of set.pieces) if (!pieces.has(piece.slot)) pieces.set(piece.slot, piece);
    relicPieces.set(set.id, pieces);
  }
  return {
    lightCones: new Map(catalog.lightCones.map((entry) => [entry.id, entry])),
    relicSets: new Map(catalog.relicSets.map((entry) => [entry.id, entry])),
    relicPieces
  };
}

export function resolvePlayerLightCone(
  lightCone: PlayerLightCone | null,
  catalog: PlayerEquipmentCatalogIndex
): PlayerLightConeView {
  return {
    equipment: lightCone,
    ...(lightCone ? { metadata: catalog.lightCones.get(lightCone.lightConeId) } : {})
  };
}

function resolveAffix(
  affix: PlayerRelicAffix | PlayerRelicSubAffix,
  properties: ReadonlyMap<string, RelicProperty>,
  recommendedTypes: ReadonlySet<string>
): PlayerRelicAffixView {
  return {
    type: affix.type,
    display: affix.display,
    percent: affix.percent,
    ...('count' in affix ? { count: affix.count } : {}),
    property: properties.get(affix.type),
    recommended: recommendedTypes.has(affix.type)
  };
}

export function resolvePlayerRelicSlots(
  relics: PlayerRelic[],
  catalog: PlayerEquipmentCatalogIndex,
  relicProperties: RelicProperty[],
  recommendation?: EquipmentRecommendationView
): PlayerRelicSlotView[] {
  const firstRelicBySlot = new Map<RelicSlot, PlayerRelic>();
  for (const relic of relics) {
    const slot = playerRelicSlot(relic.type);
    if (!firstRelicBySlot.has(slot)) firstRelicBySlot.set(slot, relic);
  }

  const properties = new Map(
    relicProperties.map((property) => [property.propertyType, property] as const)
  );
  const recommendedMainBySlot = new Map<RelicSlot, Set<string>>(
    (recommendation?.mainStats ?? []).map(({ slot, properties }) => [
      slot,
      new Set(properties.map((property) => property.propertyType))
    ])
  );
  const recommendedSubTypes = new Set(
    (recommendation?.subStats ?? []).map((property) => property.propertyType)
  );

  return PLAYER_RELIC_SLOT_ORDER.map((slot) => {
    const type = PLAYER_RELIC_TYPE_BY_SLOT[slot];
    const relic = firstRelicBySlot.get(slot) ?? null;
    if (!relic)
      return { slot, type, relic, mainAffix: null, subAffixes: [] } satisfies PlayerRelicSlotView;

    const set = catalog.relicSets.get(relic.setId);
    const piece = catalog.relicPieces.get(relic.setId)?.get(slot);
    const recommendedMainTypes = recommendedMainBySlot.get(slot) ?? new Set<string>();
    return {
      slot,
      type,
      relic,
      set,
      piece,
      mainAffix: relic.mainAffix
        ? resolveAffix(relic.mainAffix, properties, recommendedMainTypes)
        : null,
      subAffixes: relic.subAffixes.map((affix) =>
        resolveAffix(affix, properties, recommendedSubTypes)
      )
    };
  });
}
