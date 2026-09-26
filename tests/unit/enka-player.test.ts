import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptEnkaProfile } from '../../api/_player/enka/adapter';
import { decodeEnkaResponse } from '../../api/_player/enka/decode';
import { buildEnkaPlayerProfile, playerRuntimeData } from '../../api/_player/enka/pipeline';
import {
  collectPropertyContributions,
  presentCanonicalPlayerProfile
} from '../../src/lib/player/stat-synthesis';

const fixture = JSON.parse(
  readFileSync('tests/fixtures/enka/phase1-player.sanitized.json', 'utf8')
) as unknown;
const expected = JSON.parse(
  readFileSync('tests/fixtures/enka/phase1-player.expected-stats.json', 'utf8')
) as Record<string, Record<string, number>>;
const compatibilityFixtures = [
  ['compatibility-missing-promotion.sanitized.json', '100000101', 7],
  ['compatibility-control-a.sanitized.json', '100000102', 6],
  ['compatibility-control-b.sanitized.json', '100000103', 8],
  ['compatibility-missing-relic-level.sanitized.json', '100000104', 1]
] as const;
const missingPromotionFixture = JSON.parse(
  readFileSync('tests/fixtures/enka/compatibility-missing-promotion.sanitized.json', 'utf8')
) as unknown;
const fullFixture = JSON.parse(
  readFileSync('tests/fixtures/enka/compatibility-control-a.sanitized.json', 'utf8')
) as MutableFixture;
const missingRelicLevelFixture = JSON.parse(
  readFileSync('tests/fixtures/enka/compatibility-missing-relic-level.sanitized.json', 'utf8')
) as MutableFixture;

interface MutableFixture {
  unknownFutureField?: unknown;
  detailInfo: {
    uid: number;
    avatarDetailList: Array<Record<string, unknown>>;
  };
}

describe('Enka decoder and canonical adapter', () => {
  it.each(compatibilityFixtures)(
    'accepts full Enka fixture %s through decoding, adaptation and presentation',
    (filename, uid, characterCount) => {
      const raw = JSON.parse(readFileSync(`tests/fixtures/enka/${filename}`, 'utf8')) as unknown;
      const decoded = decodeEnkaResponse(raw);
      const adapted = adaptEnkaProfile(decoded);
      const result = buildEnkaPlayerProfile(raw);

      expect(decoded.uid).toBe(uid);
      expect(adapted.characters).toHaveLength(characterCount);
      expect(result.canonical.characters).toHaveLength(characterCount);
      expect(
        result.canonical.characters.every((character) => character.status === 'complete')
      ).toBe(true);
      expect(result.presentation.characters).toHaveLength(characterCount);
    }
  );

  it('normalizes omitted world level and avatar promotion before adaptation and synthesis', () => {
    const source = {
      uid: '100000001',
      detailInfo: {
        uid: 100000001,
        level: 1,
        avatarDetailList: [{ avatarId: 1310, level: 1 }]
      }
    };
    const decoded = decodeEnkaResponse(source);
    expect(decoded.detailInfo.worldLevel).toBe(0);
    expect(decoded.detailInfo.avatarDetailList![0].promotion).toBe(0);

    const adapted = adaptEnkaProfile(decoded);
    expect(adapted.worldLevel).toBe(0);
    expect(adapted.characters[0].promotion).toBe(0);

    const result = buildEnkaPlayerProfile(source);
    expect(result.canonical.profile.worldLevel).toBe(0);
    expect(result.canonical.characters[0].build.promotion).toBe(0);
  });

  it.each([
    [null, 0],
    [0, 0],
    [6, 6]
  ] as const)('normalizes present worldLevel %s to %s', (value, expected) => {
    const source = structuredClone(fullFixture);
    (source.detailInfo as Record<string, unknown>).worldLevel = value;
    const decoded = decodeEnkaResponse(source);
    expect(decoded.detailInfo.worldLevel).toBe(expected);
    expect(adaptEnkaProfile(decoded).worldLevel).toBe(expected);
  });

  it('rejects a malformed worldLevel', () => {
    const source = structuredClone(fullFixture);
    (source.detailInfo as Record<string, unknown>).worldLevel = 'invalid';
    expect(() => decodeEnkaResponse(source)).toThrowError(
      expect.objectContaining({
        code: 'UPSTREAM_INVALID_RESPONSE',
        diagnostic: 'detailInfo.worldLevel'
      })
    );
  });

  it.each([
    [null, 0],
    [0, 0],
    [6, 6]
  ] as const)('normalizes present avatar promotion %s to %s', (value, expected) => {
    const source = structuredClone(fullFixture);
    source.detailInfo.avatarDetailList[0].promotion = value;
    const decoded = decodeEnkaResponse(source);
    expect(decoded.detailInfo.avatarDetailList![0].promotion).toBe(expected);
    expect(adaptEnkaProfile(decoded).characters[0].promotion).toBe(expected);
  });

  it('rejects a malformed avatar promotion', () => {
    const source = structuredClone(fullFixture);
    source.detailInfo.avatarDetailList[0].promotion = 'invalid';
    expect(() => decodeEnkaResponse(source)).toThrowError(
      expect.objectContaining({
        code: 'UPSTREAM_INVALID_RESPONSE',
        diagnostic: 'detailInfo.avatarDetailList[0].promotion'
      })
    );
  });

  it('normalizes a numeric detail UID to the canonical string UID', () => {
    const decoded = decodeEnkaResponse(fullFixture);
    expect(decoded.uid).toBe('100000102');
    expect(decoded.detailInfo.uid).toBe('100000102');
    expect(adaptEnkaProfile(decoded).uid).toBe('100000102');
  });

  it('normalizes only an omitted light-cone promotion to zero', () => {
    const source = structuredClone(missingPromotionFixture) as MutableFixture;
    const avatar = source.detailInfo.avatarDetailList[4];
    const equipment = avatar.equipment as Record<string, unknown>;
    expect(equipment).not.toHaveProperty('promotion');

    const result = buildEnkaPlayerProfile(source);
    expect(result.canonical.characters[4].build.lightCone).toMatchObject({
      lightConeId: '21033',
      level: 1,
      promotion: 0
    });
    expect(result.canonical.characters[4].status).toBe('complete');

    for (const value of [0, null, '0', -1, 1.5]) {
      const variant = structuredClone(source);
      (variant.detailInfo.avatarDetailList[4].equipment as Record<string, unknown>).promotion =
        value;
      if (value === 0) {
        expect(
          decodeEnkaResponse(variant).detailInfo.avatarDetailList![4].equipment?.promotion
        ).toBe(0);
      } else {
        let error: unknown;
        try {
          decodeEnkaResponse(variant);
        } catch (caught) {
          error = caught;
        }
        expect(error).toMatchObject({
          code: 'UPSTREAM_INVALID_RESPONSE',
          diagnostic: 'detailInfo.avatarDetailList[4].equipment.promotion'
        });
      }
    }
  });

  it('normalizes omitted relic levels to zero while rejecting malformed present values', () => {
    const source = structuredClone(missingRelicLevelFixture);
    const relics = source.detailInfo.avatarDetailList[0].relicList as Array<
      Record<string, unknown>
    >;
    expect(relics[4]).not.toHaveProperty('level');
    expect(relics[5]).not.toHaveProperty('level');

    const decoded = decodeEnkaResponse(source);
    expect(decoded.detailInfo.avatarDetailList![0].relicList![4]).not.toHaveProperty('level');
    const adapted = adaptEnkaProfile(decoded);
    expect(adapted.characters[0].relics.map((relic) => relic.level)).toEqual([
      12, 12, 12, 12, 0, 0
    ]);
    const result = buildEnkaPlayerProfile(source);
    expect(result.canonical.characters[0].status).toBe('complete');
    expect(result.scoringFailures).toEqual([]);
    expect(result.presentation.characters[0].relics.slice(4).map((relic) => relic.level)).toEqual([
      0, 0
    ]);

    const explicitZero = structuredClone(source);
    (
      explicitZero.detailInfo.avatarDetailList[0].relicList as Array<Record<string, unknown>>
    )[4].level = 0;
    expect(adaptEnkaProfile(decodeEnkaResponse(explicitZero)).characters[0].relics[4].level).toBe(
      0
    );

    for (const [value, received] of [
      [null, 'null'],
      ['0', 'string'],
      [-1, 'number'],
      [1.5, 'number']
    ] as const) {
      const invalid = structuredClone(source);
      (
        invalid.detailInfo.avatarDetailList[0].relicList as Array<Record<string, unknown>>
      )[4].level = value;
      try {
        decodeEnkaResponse(invalid);
        throw new Error('decoder unexpectedly accepted an invalid relic level');
      } catch (error) {
        expect(error).toMatchObject({
          code: 'UPSTREAM_INVALID_RESPONSE',
          diagnostic: 'detailInfo.avatarDetailList[0].relicList[4].level',
          expected: 'non-negative safe integer',
          received
        });
      }
    }
  });

  it('normalizes optional fields without retaining _flat and preserves occurrence identity', () => {
    const decoded = decodeEnkaResponse(fixture);
    const profile = adaptEnkaProfile(decoded);
    expect(profile.uid).toBe('100000001');
    expect(profile.nickname).toBe('');
    expect(profile.characters).toHaveLength(6);
    expect(profile.characters.slice(0, 3).map((build) => build.display.area)).toEqual([
      'assist',
      'assist',
      'assist'
    ]);
    expect(profile.characters[3].display).toMatchObject({ area: 'showcase', position: 1 });
    expect(profile.characters[3].eidolon).toBe(0);
    expect(profile.characters[0].relics[1].subAffixes[3]).not.toHaveProperty('step');
    expect(JSON.stringify(profile)).not.toContain('_flat');
  });

  it('keeps duplicate avatar builds and ignores unknown response fields', () => {
    const source = structuredClone(fixture) as MutableFixture;
    source.unknownFutureField = { accepted: true };
    source.detailInfo.avatarDetailList = [
      source.detailInfo.avatarDetailList[0],
      {
        ...source.detailInfo.avatarDetailList[0],
        _assist: undefined,
        pos: 4,
        rank: undefined
      }
    ];
    const profile = adaptEnkaProfile(decodeEnkaResponse(source));
    expect(profile.characters.map((build) => build.avatarId)).toEqual(['1310', '1310']);
    expect(new Set(profile.characters.map((build) => build.buildId)).size).toBe(2);
    expect(profile.characters[1].eidolon).toBe(0);
    expect(profile.characters[1].display.area).toBe('showcase');
  });

  it.each([
    'privacySettingInfo',
    'platform',
    'friendCount',
    'personalCardId',
    'playerDisplayArea',
    'isDisplayAvatar'
  ])('ignores absent or changed unused detail field %s', (field) => {
    const baseline = adaptEnkaProfile(decodeEnkaResponse(fullFixture));
    const absent = structuredClone(fullFixture);
    delete (absent.detailInfo as Record<string, unknown>)[field];
    expect(adaptEnkaProfile(decodeEnkaResponse(absent))).toEqual(baseline);

    const changed = structuredClone(fullFixture);
    (changed.detailInfo as Record<string, unknown>)[field] = { futureShape: true };
    expect(adaptEnkaProfile(decodeEnkaResponse(changed))).toEqual(baseline);
  });

  it.each(['missing', 'empty'] as const)(
    'normalizes %s avatarDetailList to no public characters',
    (variant) => {
      const source = structuredClone(fullFixture);
      if (variant === 'missing')
        delete (source.detailInfo as Record<string, unknown>).avatarDetailList;
      else source.detailInfo.avatarDetailList = [];
      expect(adaptEnkaProfile(decodeEnkaResponse(source)).characters).toEqual([]);
    }
  );

  it('preserves each available count when recordInfo is partial', () => {
    const source = structuredClone(fullFixture);
    (source.detailInfo as Record<string, unknown>).recordInfo = {
      avatarCount: 0,
      bookCount: 'future format'
    };
    const result = buildEnkaPlayerProfile(source);
    expect(result.canonical.profile.records).toEqual({ avatarCount: 0 });
    expect(result.presentation).toMatchObject({
      characterCount: 0,
      lightConeCount: null,
      achievementCount: null
    });

    delete (source.detailInfo as Record<string, unknown>).recordInfo;
    expect(buildEnkaPlayerProfile(source).presentation).toMatchObject({
      characterCount: null,
      lightConeCount: null,
      achievementCount: null
    });
  });

  it('normalizes absent optional character lists and equipment independently', () => {
    const source = structuredClone(fullFixture);
    const avatar = source.detailInfo.avatarDetailList[0];
    delete avatar.skillTreeList;
    delete avatar.relicList;
    delete avatar.equipment;
    delete avatar._assist;
    delete avatar.enhancedId;
    const build = adaptEnkaProfile(decodeEnkaResponse(source)).characters[0];
    expect(build).toMatchObject({ traces: [], relics: [] });
    expect(build.lightCone).toBeUndefined();
    expect(build.enhancedId).toBeUndefined();

    const withRelic = structuredClone(fullFixture);
    const relic = (
      withRelic.detailInfo.avatarDetailList[0].relicList as Array<Record<string, unknown>>
    )[0];
    delete relic.subAffixList;
    expect(
      adaptEnkaProfile(decodeEnkaResponse(withRelic)).characters[0].relics[0].subAffixes
    ).toEqual([]);
  });

  it('ignores unknown fields at every parsed level', () => {
    const source = structuredClone(fullFixture);
    source.unknownFutureField = { foo: 'bar' };
    (source.detailInfo as Record<string, unknown>).futureDetail = { foo: 'bar' };
    source.detailInfo.avatarDetailList[0].futureAvatar = { foo: 'bar' };
    const equipment = source.detailInfo.avatarDetailList[0].equipment as Record<string, unknown>;
    equipment.futureEquipment = { foo: 'bar' };
    expect(adaptEnkaProfile(decodeEnkaResponse(source))).toEqual(
      adaptEnkaProfile(decodeEnkaResponse(fullFixture))
    );
  });

  it.each([
    [
      'detailInfo',
      (source: MutableFixture): void => {
        (source as unknown as Record<string, unknown>).detailInfo = 'broken';
      }
    ],
    [
      'detailInfo.avatarDetailList[0].avatarId',
      (source: MutableFixture): void => {
        delete source.detailInfo.avatarDetailList[0].avatarId;
      }
    ],
    [
      'uid',
      (source: MutableFixture): void => {
        (source as unknown as Record<string, unknown>).uid = 100000102;
      }
    ],
    [
      'detailInfo.uid',
      (source: MutableFixture): void => {
        (source.detailInfo as Record<string, unknown>).uid = '100000102';
      }
    ],
    [
      'detailInfo.level',
      (source: MutableFixture): void => {
        delete (source.detailInfo as Record<string, unknown>).level;
      }
    ],
    [
      'detailInfo.avatarDetailList[0].level',
      (source: MutableFixture): void => {
        delete source.detailInfo.avatarDetailList[0].level;
      }
    ],
    ...(['tid', 'rank', 'level'] as const).map(
      (field) =>
        [
          `detailInfo.avatarDetailList[0].equipment.${field}`,
          (source: MutableFixture): void => {
            delete (source.detailInfo.avatarDetailList[0].equipment as Record<string, unknown>)[
              field
            ];
          }
        ] as const
    ),
    [
      'detailInfo.avatarDetailList[0].relicList[0].mainAffixId',
      (source: MutableFixture): void => {
        delete (
          source.detailInfo.avatarDetailList[0].relicList as Array<Record<string, unknown>>
        )[0].mainAffixId;
      }
    ],
    [
      'detailInfo.avatarDetailList',
      (source: MutableFixture): void => {
        (source.detailInfo as Record<string, unknown>).avatarDetailList = 'broken';
      }
    ],
    [
      'detailInfo.recordInfo.avatarCount',
      (source: MutableFixture): void => {
        (source.detailInfo as Record<string, unknown>).recordInfo = { avatarCount: 'broken' };
      }
    ]
  ] as const)('rejects malformed core field %s', (path, mutate) => {
    const source = structuredClone(fullFixture);
    mutate(source);
    expect(() => decodeEnkaResponse(source)).toThrowError(
      expect.objectContaining({ code: 'UPSTREAM_INVALID_RESPONSE', diagnostic: path })
    );
  });

  it.each([0, 6])('rejects light-cone rank %s outside 1–5', (rank) => {
    const source = structuredClone(fullFixture);
    (source.detailInfo.avatarDetailList[0].equipment as Record<string, unknown>).rank = rank;
    expect(() => decodeEnkaResponse(source)).toThrowError(
      expect.objectContaining({
        code: 'UPSTREAM_INVALID_RESPONSE',
        diagnostic: 'detailInfo.avatarDetailList[0].equipment.rank'
      })
    );
  });

  it('fails with a stable public code and a non-payload diagnostic path', () => {
    const source = structuredClone(fixture) as MutableFixture;
    source.detailInfo.uid = 2;
    try {
      decodeEnkaResponse(source);
      throw new Error('decoder unexpectedly accepted mismatched UIDs');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'UPSTREAM_INVALID_RESPONSE',
        diagnostic: 'detailInfo.uid'
      });
    }
  });
});

describe('Enka production stat pipeline golden', () => {
  it('reproduces 51 same-state assertions across six builds within 1e-8', () => {
    const result = buildEnkaPlayerProfile(fixture);
    expect(
      new Set(
        collectPropertyContributions(
          result.canonical.characters[0].build,
          playerRuntimeData
        ).contributions.map(({ source }) => source)
      )
    ).toEqual(
      new Set([
        'avatar',
        'lightCone',
        'lightConeAbility',
        'relicMain',
        'relicSub',
        'relicSet',
        'trace'
      ])
    );
    let assertions = 0;
    for (const character of result.canonical.characters) {
      expect(character.status).toBe('complete');
      for (const [field, value] of Object.entries(expected[character.build.avatarId])) {
        expect(character.values[field], `${character.build.avatarId}.${field}`).toBeCloseTo(
          value,
          8
        );
        assertions += 1;
      }
    }
    expect(assertions).toBe(51);
    expect(result.presentation.characters).toHaveLength(6);
    expect(result.presentation.characters[0]).toMatchObject({
      buildId: 'area:assist:position:none:order:0',
      display: { area: 'assist', sourceOrder: 0 }
    });
    expect(result.presentation.characters[0].stats[0]).toEqual({
      field: 'hp',
      percent: false,
      total: '3115'
    });
    const firstRelic = result.canonical.characters[0].build.relics[0];
    expect(result.presentation.characters[0].relics[0].rarity).toBe(
      playerRuntimeData.relics[firstRelic.tid].rarity
    );
    expect(result.presentation.characters[0].relics[0].rarity).toBe(5);

    const runtimeWithoutRarity = structuredClone(playerRuntimeData);
    delete runtimeWithoutRarity.relics[firstRelic.tid].rarity;
    expect(
      presentCanonicalPlayerProfile(result.canonical, runtimeWithoutRarity).characters[0].relics[0]
    ).not.toHaveProperty('rarity');
    const unknownRelic = structuredClone(result.canonical);
    unknownRelic.characters[0].build.relics[0].tid = 'unknown';
    expect(
      presentCanonicalPlayerProfile(unknownRelic, playerRuntimeData).characters[0].relics[0]
    ).not.toHaveProperty('rarity');
  });
});
