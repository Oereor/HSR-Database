import { describe, expect, it, vi } from 'vitest';
import type { EquipmentRecommendationView } from '../../src/lib/domain/equipment-recommendation-view';
import type { RelicProperty } from '../../src/lib/domain/types';
import { createPlayerEquipmentCatalogClient } from '../../src/lib/player/equipment-client';
import {
  createPlayerEquipmentCatalogIndex,
  playerRelicSlot,
  resolvePlayerLightCone,
  resolvePlayerRelicSlots,
  type PlayerEquipmentCatalog
} from '../../src/lib/player/equipment';
import type { PlayerRelic } from '../../src/lib/player/contract';

const catalog: PlayerEquipmentCatalog = {
  schemaVersion: 1,
  locale: 'zh-CN',
  lightCones: [{ id: '23023', name: '命运从未公平', rarity: 5, path: 'Knight', pathName: '存护' }],
  relicSets: [
    {
      id: '103',
      name: '净庭教宗的圣骑士',
      pieces: [
        { id: '31031', slot: 'HEAD', name: '圣骑的宽恕盔面' },
        { id: '31032', slot: 'HAND', name: '圣骑的沉默誓环' },
        { id: '31033', slot: 'BODY', name: '圣骑的肃穆胸甲' },
        { id: '31034', slot: 'FOOT', name: '圣骑的秩序铁靴' }
      ]
    }
  ]
};

const properties: RelicProperty[] = [
  {
    propertyType: 'HPDelta',
    name: '生命值',
    iconKey: 'IconMaxHP',
    allowedMainSlots: ['HEAD'],
    canBeSubStat: true
  },
  {
    propertyType: 'DefenceAddedRatio',
    name: '防御力',
    iconKey: 'IconDefence',
    allowedMainSlots: ['BODY', 'FOOT', 'NECK', 'OBJECT'],
    canBeSubStat: true
  },
  {
    propertyType: 'SpeedDelta',
    name: '速度',
    iconKey: 'IconSpeed',
    allowedMainSlots: ['FOOT'],
    canBeSubStat: true
  }
];

const recommendation: EquipmentRecommendationView = {
  lightCones: [],
  cavernSets: [],
  planarSets: [],
  mainStats: [
    { slot: 'BODY', properties: [properties[1], properties[2]] },
    { slot: 'FOOT', properties: [properties[2]] },
    { slot: 'NECK', properties: [] },
    { slot: 'OBJECT', properties: [] }
  ],
  subStats: [properties[1]]
};

const relic = (overrides: Partial<PlayerRelic> = {}): PlayerRelic => ({
  type: 3,
  setId: '103',
  level: 15,
  mainAffix: { type: 'DefenceAddedRatio', display: '54.0%', percent: true },
  subAffixes: [
    { type: 'DefenceAddedRatio', display: '8.2%', percent: true, count: 2 },
    { type: 'SpeedDelta', display: '7', percent: false, count: 0 }
  ],
  ...overrides
});

describe('Player equipment resolver', () => {
  const index = createPlayerEquipmentCatalogIndex(catalog);

  it('resolves known, null and unknown Light Cones while preserving progression', () => {
    const known = resolvePlayerLightCone(
      { lightConeId: '23023', level: 80, promotion: 6, rank: 5 },
      index
    );
    const unknown = resolvePlayerLightCone(
      { lightConeId: '999999', level: 70, promotion: 5, rank: 2 },
      index
    );

    expect(known.metadata?.name).toBe('命运从未公平');
    expect(known.equipment).toMatchObject({ level: 80, promotion: 6, rank: 5 });
    expect(resolvePlayerLightCone(null, index)).toEqual({ equipment: null });
    expect(unknown.metadata).toBeUndefined();
    expect(unknown.equipment).toMatchObject({ level: 70, promotion: 5, rank: 2 });
  });

  it('maps MiHoMo types to the canonical six-slot order', () => {
    expect([1, 2, 3, 4, 5, 6].map((type) => playerRelicSlot(type as PlayerRelic['type']))).toEqual([
      'HEAD',
      'HAND',
      'BODY',
      'FOOT',
      'NECK',
      'OBJECT'
    ]);
  });

  it('retains missing slots, keeps the first duplicate and isolates unknown sets', () => {
    const slots = resolvePlayerRelicSlots(
      [
        relic({ type: 3, level: 12 }),
        relic({ type: 3, level: 15 }),
        relic({ type: 1, setId: '999999' })
      ],
      index,
      properties,
      recommendation
    );

    expect(slots.map(({ slot }) => slot)).toEqual([
      'HEAD',
      'HAND',
      'BODY',
      'FOOT',
      'NECK',
      'OBJECT'
    ]);
    expect(slots[2].relic?.level).toBe(12);
    expect(slots[1].relic).toBeNull();
    expect(slots[0]).toMatchObject({ set: undefined, piece: undefined });
    expect(slots[2].piece?.name).toBe('圣骑的肃穆胸甲');
  });

  it('resolves affixes structurally and matches recommendations only by canonical type', () => {
    const [body] = resolvePlayerRelicSlots(
      [
        relic({
          mainAffix: { type: 'SpeedDelta', display: '25', percent: false },
          subAffixes: [
            { type: 'DefenceAddedRatio', display: '1%', percent: true, count: 0 },
            { type: 'SpeedDelta', display: '999', percent: false, count: 5 },
            { type: 'FutureProperty', display: '12.3%', percent: true, count: 3 }
          ]
        })
      ],
      index,
      properties,
      recommendation
    ).filter(({ slot }) => slot === 'BODY');

    expect(body.mainAffix).toMatchObject({
      type: 'SpeedDelta',
      display: '25',
      recommended: true
    });
    expect(body.subAffixes).toMatchObject([
      { type: 'DefenceAddedRatio', display: '1%', count: 0, recommended: true },
      { type: 'SpeedDelta', display: '999', count: 5, recommended: false },
      { type: 'FutureProperty', display: '12.3%', count: 3, recommended: false }
    ]);
    expect(body.subAffixes[2].property).toBeUndefined();
  });

  it('preserves a nullable main affix without affecting sub-affixes', () => {
    const head = resolvePlayerRelicSlots(
      [relic({ type: 1, mainAffix: null })],
      index,
      properties,
      recommendation
    )[0];
    expect(head.mainAffix).toBeNull();
    expect(head.subAffixes).toHaveLength(2);
  });
});

describe('Player equipment catalog client', () => {
  it('validates identity and caches one request per locale', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 }));
    const client = createPlayerEquipmentCatalogClient(fetchImpl as typeof fetch);

    await expect(client.load('zh-CN')).resolves.toEqual(catalog);
    await expect(client.load('zh-CN')).resolves.toEqual(catalog);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/generated/zh-CN/player-equipment.json', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
  });

  it('rejects a mismatched locale and retries after failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog), { status: 200 }));
    const client = createPlayerEquipmentCatalogClient(fetchImpl as typeof fetch);

    await expect(client.load('zh-CN')).rejects.toThrow('503');
    await expect(client.load('zh-CN')).resolves.toEqual(catalog);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const mismatched = createPlayerEquipmentCatalogClient(
      vi.fn(
        async () => new Response(JSON.stringify({ ...catalog, locale: 'en' }), { status: 200 })
      ) as typeof fetch
    );
    await expect(mismatched.load('zh-CN')).rejects.toThrow('identity');
  });
});
