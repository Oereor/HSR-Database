import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PlayerApiError } from '../../api/_player/errors';
import { parsePlayerProfile } from '../../api/_player/parse';

const fixtureFile = path.resolve('tests/fixtures/mihomo/phase1-player-response.synthetic.json');

let fixture: unknown;

function cloneFixture(): Record<string, unknown> {
  return structuredClone(fixture) as Record<string, unknown>;
}

beforeAll(async () => {
  fixture = JSON.parse(await readFile(fixtureFile, 'utf8')) as unknown;
});

describe('MiHoMo player response projection', () => {
  it('projects player metadata and ignores unknown or static fields', () => {
    const profile = parsePlayerProfile(fixture);

    expect(profile).toMatchObject({
      uid: '100000001',
      nickname: 'Synthetic Player',
      level: 70,
      worldLevel: 6,
      avatar: { id: '200001', icon: 'icon/avatar/200001.png' },
      signature: 'Synthetic fixture only',
      characterCount: 42,
      lightConeCount: 57,
      achievementCount: 888
    });
    expect(profile).not.toHaveProperty('relicCount');
    expect(profile).not.toHaveProperty('friend_count');
    expect(profile.avatar).not.toHaveProperty('name');

    const character = profile.characters[0] as unknown as Record<string, unknown>;
    for (const field of [
      'name',
      'rarity',
      'path',
      'element',
      'skills',
      'properties',
      'relic_sets'
    ]) {
      expect(character).not.toHaveProperty(field);
    }
  });

  it('preserves progression, nullable equipment, and unknown ids without local resolution', () => {
    const profile = parsePlayerProfile(fixture);
    const first = profile.characters[0];
    const enhanced = profile.characters[1];

    expect(first.progression).toEqual({ rank: 2, level: 80, promotion: 6, enhanced: false });
    expect(first.skillTree).toEqual([
      { id: '1413301', level: 6 },
      { id: '1413209', level: 0 }
    ]);
    expect(first.lightCone).toEqual({
      lightConeId: '999998',
      rank: 1,
      level: 80,
      promotion: 6
    });
    expect(first.relics).toEqual([
      {
        type: 1,
        setId: '999997',
        level: 15,
        mainAffix: null,
        subAffixes: [{ type: 'UnknownPhase1Property', display: '0', percent: false, count: 0 }]
      }
    ]);
    expect(enhanced.progression.enhanced).toBe(true);
    expect(enhanced.lightCone).toBeNull();
  });

  it('joins stats by field while preserving statistics order and display strings', () => {
    const stats = parsePlayerProfile(fixture).characters[0].stats;

    expect(stats).toEqual([
      {
        field: 'HP',
        percent: false,
        total: '3,456',
        base: '1,234',
        addition: '2,222'
      },
      {
        field: 'Speed',
        percent: false,
        total: '134.2',
        base: null,
        addition: '34.2'
      },
      {
        field: 'CriticalChance',
        percent: true,
        total: '72.3%',
        base: '5.0%',
        addition: null
      }
    ]);
    expect(stats[0]).not.toHaveProperty('value');
  });

  it('keeps the first character when the upstream response contains duplicate ids', () => {
    const profile = parsePlayerProfile(fixture);

    expect(profile.characters.map(({ characterId }) => characterId)).toEqual(['1413', '1310']);
    expect(profile.characters[0].progression.level).toBe(80);
  });

  it('normalizes optional player branches and missing stat join sources', () => {
    const value = cloneFixture();
    const player = value.player as Record<string, unknown>;
    const characters = value.characters as Array<Record<string, unknown>>;
    player.avatar = null;
    player.space_info = null;
    delete characters[0].attributes;
    delete characters[0].additions;

    const profile = parsePlayerProfile(value);
    expect(profile.avatar).toBeNull();
    expect([profile.characterCount, profile.lightConeCount, profile.achievementCount]).toEqual([
      null,
      null,
      null
    ]);
    expect(
      profile.characters[0].stats.every(({ base, addition }) => base === null && addition === null)
    ).toBe(true);
  });

  it.each([
    [
      'player level',
      (value: Record<string, unknown>) => {
        (value.player as Record<string, unknown>).level = '70';
      }
    ],
    [
      'enhanced flag',
      (value: Record<string, unknown>) => {
        (value.characters as Array<Record<string, unknown>>)[0].enhanced = 'false';
      }
    ],
    [
      'relic type',
      (value: Record<string, unknown>) => {
        const character = (value.characters as Array<Record<string, unknown>>)[0];
        (character.relics as Array<Record<string, unknown>>)[0].type = 7;
      }
    ]
  ])('rejects a malformed projected %s', (_label, mutate) => {
    const value = cloneFixture();
    mutate(value);

    expect(() => parsePlayerProfile(value)).toThrowError(PlayerApiError);
    expect(() => parsePlayerProfile(value)).toThrowError('UPSTREAM_INVALID_RESPONSE');
  });
});
