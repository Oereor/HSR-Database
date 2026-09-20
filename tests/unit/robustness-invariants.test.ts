import { describe, expect, it, vi } from 'vitest';
import type { Character, DataManifest, Enemy } from '../../src/lib/domain/types';
import type { EndgameDatasetByMode, EnemyOccurrence } from '../../src/lib/domain/endgame';
import type { EndgameOccurrenceShard, GlobalSearchIndex } from '../../src/lib/domain/search-index';
import { buildGeneratedRouteInventory } from '../../scripts/data/routes';
import {
  assertValidationReport,
  validateLocalizationHealth,
  validateProductProjection,
  validateRelationAudits,
  type ProductProjectionForValidation
} from '../../scripts/data/robustness-invariants';
import { classifyProductSkill } from '../../scripts/data/skills';
import { parseRelicEffectRequirement, parseRelicPieceId } from '../../scripts/data/domain/relic';
import type { LocalizationHealthSummary } from '../../scripts/data/localization';
import {
  assertCrossLocaleStructuralParity,
  digestStructuralProjection,
  stableStructuralProjection
} from '../../scripts/data/structural-parity';

const occurrence = (): EnemyOccurrence =>
  ({
    monsterId: 101,
    monsterTemplateId: 100,
    hp: {
      hpBase: '10',
      instanceRatio: '2',
      levelRatio: '3',
      eliteRatio: '4',
      baseEncounterMaxHpPerBar: '240',
      final: {
        status: 'resolved',
        maxHpPerBar: '240',
        source: 'base-encounter',
        rounding: 'half-up'
      },
      eliteGroupId: 1,
      eliteGroupTable: 'elite',
      eliteContextSource: 'stage',
      eliteContextConfidence: 'verified'
    },
    speed: { status: 'unavailable', reason: 'missing-base' },
    toughness: {
      internalStance: { status: 'unavailable', reason: 'missing-base' },
      display: { status: 'unavailable', reason: 'missing-base' },
      runtimeStatus: 'static'
    },
    mechanics: {
      summons: [],
      sharedHp: false,
      restoresHp: false,
      locksHp: false,
      manipulatesHp: false,
      abilityReferences: [],
      effectiveTotalHpStatus: 'static'
    }
  }) as unknown as EnemyOccurrence;

function datasets(): EndgameDatasetByMode {
  const moc = {
    schemaVersion: 24 as const,
    mode: 'moc' as const,
    groups: [
      {
        mode: 'moc' as const,
        groupId: 1,
        schedule: { begin: '2026-01-01 00:00:00', end: '2026-02-01 00:00:00' },
        encounters: [
          {
            id: 'encounter-1',
            configId: 1,
            variant: 'floor' as const,
            battles: [
              {
                slot: 1,
                stages: [
                  {
                    eventId: 1,
                    stageId: 1,
                    level: 1,
                    hardLevelGroup: 1,
                    stageAbilities: [],
                    previewMonsterIds: [],
                    waveModel: {
                      kind: 'fixed' as const,
                      waves: [{ wave: 1, enemies: [occurrence()] }]
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  return {
    moc,
    pf: { schemaVersion: 24, mode: 'pf', groups: [] },
    as: { schemaVersion: 24, mode: 'as', groups: [] },
    aa: { schemaVersion: 24, mode: 'aa', groups: [] }
  };
}

const progression = () => ({
  minLevel: 1,
  maxLevel: 2,
  defaultLevel: 2,
  stages: [
    {
      fromLevel: 1,
      toLevel: 2,
      hp: { base: 1, perLevel: 1 },
      attack: { base: 1, perLevel: 1 },
      defence: { base: 1, perLevel: 1 }
    }
  ]
});

const character = (id: string): Character =>
  ({
    id,
    name: `Character ${id}`,
    kind: 'character',
    profiles: {
      base: {
        energy: { kind: 'standard', max: 100 },
        skillCards: [],
        specialEffects: [],
        traces: [],
        eidolons: []
      }
    },
    baseStats: progression(),
    equipmentRecommendation: {
      avatarId: id,
      lightConeIds: [],
      cavernSetIds: [],
      planarSetIds: [],
      mainStatOptions: [],
      subStatPropertyTypes: []
    }
  }) as Character;

const enemyLevel = (level: number) => ({
  level,
  hp: { status: 'unavailable' as const, reason: 'missing-base' as const },
  attack: { status: 'unavailable' as const, reason: 'missing-base' as const },
  defence: { status: 'unavailable' as const, reason: 'missing-base' as const },
  speed: { status: 'unavailable' as const, reason: 'missing-base' as const },
  toughness: { status: 'unavailable' as const, reason: 'missing-base' as const },
  effectHit: { status: 'unavailable' as const, reason: 'missing-base' as const },
  effectResistance: { status: 'unavailable' as const, reason: 'missing-base' as const }
});

const enemy = (templateId = '100', monsterId = '101'): Enemy =>
  ({
    id: templateId,
    name: 'Enemy',
    kind: 'enemy',
    rank: 'Minion',
    template: {
      monsterTemplateId: templateId,
      name: 'Enemy',
      rank: 'Minion',
      baseStats: { hp: '10', attack: '1', defence: '1', criticalDamage: '0.5' }
    },
    monsters: [
      {
        monsterId,
        monsterTemplateId: templateId,
        hardLevelGroup: '1',
        modifiers: Object.fromEntries(
          ['hp', 'attack', 'defence', 'speed', 'stance'].map((field) => [field, { ratio: '1' }])
        ),
        stats: {
          minLevel: 1,
          maxLevel: 2,
          defaultLevel: 2,
          levels: [enemyLevel(1), enemyLevel(2)]
        },
        weaknesses: [],
        resistances: [],
        specialResistances: [],
        summons: [],
        skills: [],
        skillPhases: []
      }
    ],
    defaultMonsterId: monsterId,
    defaultMonster: { monsterId },
    weaknesses: []
  }) as unknown as Enemy;

function addCharacterFixture(
  manifest: DataManifest,
  projection: ProductProjectionForValidation,
  id: string
): void {
  manifest.routes.characters.push(id);
  projection.catalogs.characters.push({ id, name: `Character ${id}` });
  projection.details.characters.push(character(id));
  projection.search.documents.push({
    key: `character:${id}`,
    target: { kind: 'character', id },
    canonicalName: `Character ${id}`,
    officialAliases: [],
    playerAliases: []
  });
  manifest.routePaths = buildGeneratedRouteInventory(
    manifest.routes,
    projection.endgame
  ).routePaths;
}

function addEnemyFixture(
  manifest: DataManifest,
  projection: ProductProjectionForValidation,
  templateId: string,
  monsterId: string
): void {
  manifest.routes.enemies.push(templateId);
  projection.catalogs.enemies.push({ id: templateId, name: `Enemy ${templateId}` });
  projection.details.enemies.push(enemy(templateId, monsterId));
  projection.search.documents.push({
    key: `enemy:${templateId}`,
    target: { kind: 'enemy', id: templateId },
    canonicalName: `Enemy ${templateId}`,
    officialAliases: [],
    playerAliases: []
  });
  manifest.routePaths = buildGeneratedRouteInventory(
    manifest.routes,
    projection.endgame
  ).routePaths;
}

function fixture(): { manifest: DataManifest; projection: ProductProjectionForValidation } {
  const endgame = datasets();
  const locator = {
    mode: 'moc' as const,
    groupId: 1,
    encounterId: 'encounter-1',
    battleSlot: 1,
    stageId: 1,
    wave: { kind: 'fixed' as const, number: 1 },
    monsterId: 101
  };
  const key = JSON.stringify(['moc', 1, 'encounter-1', 1, 1, 'fixed', 1, 101]);
  const search = {
    locale: 'en',
    documents: [
      {
        key: 'enemy:100',
        target: { kind: 'enemy', id: '100' },
        canonicalName: 'Enemy',
        officialAliases: [],
        playerAliases: []
      },
      {
        key: 'endgame:100',
        target: { kind: 'endgame', id: '100' },
        canonicalName: 'Enemy',
        officialAliases: [],
        playerAliases: []
      }
    ],
    endgameTargets: [
      {
        id: '100',
        name: 'Enemy',
        occurrences: [
          {
            locator,
            order: { encounter: 0, battle: 0, stage: 0, wave: 0, card: 0 }
          }
        ]
      }
    ]
  } as unknown as GlobalSearchIndex;
  const shard = {
    schemaVersion: 2,
    locale: 'en',
    target: { kind: 'endgame', id: '100' },
    periods: [
      {
        mode: 'moc',
        period: {
          groupId: 1,
          name: 'Period',
          dateLabel: '2026/01/01 – 2026/02/01',
          status: 'historical',
          encounterCount: 1
        }
      }
    ],
    occurrences: {
      [key]: {
        key,
        occurrence: {
          identity: '100:101',
          monsterId: 101,
          monsterTemplateId: 100,
          name: 'Enemy',
          enemyHref: '/enemies/100',
          weaknesses: [],
          hp: { roundedPerBar: '240' },
          speed: { rounded: '-' },
          toughness: { roundedPerBar: '-' }
        }
      }
    }
  } as EndgameOccurrenceShard;
  const routes = { characters: [], 'light-cones': [], relics: [], enemies: ['100'] };
  const inventory = buildGeneratedRouteInventory(routes, endgame);
  const manifest = {
    schemaVersion: 43,
    generatedLocales: ['zh-CN', 'en'],
    publicLocale: 'zh-CN',
    publicLocales: ['zh-CN', 'en'],
    routes,
    counts: { characters: 0, lightCones: 0, relics: 0, relicProperties: 0, enemies: 1 },
    routePaths: inventory.routePaths
  } as unknown as DataManifest;
  return {
    manifest,
    projection: {
      locale: 'en',
      catalogs: {
        characters: [],
        'light-cones': [],
        relics: [],
        enemies: [{ id: '100', name: 'Enemy' }]
      },
      details: { characters: [], 'light-cones': [], relics: [], enemies: [enemy()] },
      relicProperties: [],
      endgame,
      search,
      occurrenceShards: { '100': shard }
    }
  };
}

const health = (
  overrides: Partial<LocalizationHealthSummary['entries'][number]> = {}
): LocalizationHealthSummary =>
  ({
    total: 1,
    statuses: { available: 0, absent: 0, missing: 1, empty: 0, invalid: 0, unsupported: 0 },
    requirements: { required: 1, optional: 0 },
    visibility: { emitted: 1, hidden: 0 },
    fallbackUse: { used: 0, notUsed: 1 },
    routeReachability: { reachable: 1, unreachable: 0 },
    unclassified: 0,
    invalidProgramStateErrors: 0,
    entries: [
      {
        status: 'missing',
        identifier: '123456789',
        source: { entity: 'character', id: '1001', field: 'name' },
        locale: 'en',
        textMapCode: 'EN',
        disposition: {
          requirement: 'required',
          visibility: 'emitted',
          fallbackUsed: false,
          productRouteReachability: 'reachable'
        },
        ...overrides
      }
    ]
  }) as LocalizationHealthSummary;

describe('focused robustness invariants', () => {
  it('ignores localized wording while rejecting cross-locale identity and numeric drift', () => {
    const projection = () => ({
      catalogs: { characters: [], 'light-cones': [], relics: [], enemies: [] },
      details: {
        characters: [
          {
            id: '1',
            name: '中文',
            baseStats: {
              stages: [{ fromLevel: 1, toLevel: 20, hp: { base: 100, perLevel: 3.5 } }]
            },
            profiles: { base: { traces: [{ id: '2', prerequisiteIds: ['1'], type: 'stat' }] } }
          }
        ],
        'light-cones': [],
        relics: [],
        enemies: []
      },
      relicProperties: [],
      endgame: { datasets: { moc: {}, pf: {}, as: {}, aa: {} } },
      globalSearchIndex: { documents: [], endgameTargets: [] },
      homepage: {},
      occurrenceShards: {}
    });
    const base = projection();
    const localized = structuredClone(base);
    localized.details.characters[0].name = 'Arbitrary visible words';
    const report = assertCrossLocaleStructuralParity(base, localized);
    expect(report.differences).toBe(0);
    expect(report.projectionCount).toBe(34);
    expect(Object.keys(report.comparisons)).toHaveLength(17);

    const characterProjection = stableStructuralProjection(base.details.characters, 'characters');
    expect(digestStructuralProjection(characterProjection)).toBe(
      digestStructuralProjection(
        stableStructuralProjection(localized.details.characters, 'characters')
      )
    );

    const numericDrift = structuredClone(localized);
    numericDrift.details.characters[0].baseStats.stages[0].hp.perLevel = 3.6;
    expect(() => assertCrossLocaleStructuralParity(base, numericDrift)).toThrow(
      'Cross-locale structural mismatch'
    );

    const identityDrift = structuredClone(localized);
    identityDrift.details.characters[0].profiles.base.traces[0].prerequisiteIds = ['999'];
    expect(() => assertCrossLocaleStructuralParity(base, identityDrift)).toThrow(
      '$.0.profiles.base.traces.0.prerequisiteIds.0'
    );

    const ordered = projection();
    ordered.details.characters[0].profiles.base.traces[0].prerequisiteIds = ['1', '2'];
    const reordered = structuredClone(ordered);
    reordered.details.characters[0].profiles.base.traces[0].prerequisiteIds.reverse();
    expect(() => assertCrossLocaleStructuralParity(ordered, reordered)).toThrow(
      'Cross-locale structural mismatch'
    );
  });

  it('parses source-backed Relic piece identity strictly', () => {
    expect(parseRelicPieceId('RelicName_31011')).toBe('31011');
    expect(() => parseRelicPieceId('31011')).toThrow();
    expect(() => parseRelicPieceId('RelicName_31011_extra')).toThrow();
  });

  it('accepts a valid graph, reordered identities and legitimate additional groups', () => {
    const { manifest, projection } = fixture();
    expect(validateProductProjection(manifest, projection).errors).toEqual([]);

    addCharacterFixture(manifest, projection, '2001');
    addEnemyFixture(manifest, projection, '200', '201');
    projection.endgame.moc.groups.push({
      mode: 'moc',
      groupId: 2,
      encounters: []
    });
    manifest.routePaths = buildGeneratedRouteInventory(
      manifest.routes,
      projection.endgame
    ).routePaths.reverse();
    expect(validateProductProjection(manifest, projection).errors).toEqual([]);
  });

  it('fails a required own-locale reference and accepts an explicit fallback', () => {
    const missing = validateLocalizationHealth('en', 'EN', health());
    expect(missing.errors[0]).toMatchObject({
      domain: 'localization',
      code: 'required-reference',
      entityId: 'character:1001',
      path: 'name ref=123456789'
    });
    expect(missing.errors[0]?.message).toContain('locale=en');

    const fallback = validateLocalizationHealth(
      'en',
      'EN',
      health({ disposition: { ...health().entries[0].disposition!, fallbackUsed: true } })
    );
    expect(fallback.errors).toEqual([]);
    expect(fallback.warnings[0]?.code).toBe('classified-fallback');

    const optional = validateLocalizationHealth(
      'en',
      'EN',
      health({
        disposition: {
          requirement: 'optional',
          visibility: 'emitted',
          fallbackUsed: false,
          productRouteReachability: 'reachable'
        }
      })
    );
    expect(optional.errors).toEqual([]);
    expect(optional.warnings[0]?.code).toBe('optional-missing');

    const hidden = validateLocalizationHealth(
      'en',
      'EN',
      health({
        disposition: {
          requirement: 'optional',
          visibility: 'hidden',
          fallbackUsed: false,
          productRouteReachability: 'unreachable'
        }
      })
    );
    expect(hidden.errors).toEqual([]);
    expect(hidden.warnings[0]?.code).toBe('optional-missing');

    expect(
      validateLocalizationHealth('en', 'EN', health({ textMapCode: 'CHS' })).errors[0]
    ).toMatchObject({
      code: 'locale-source'
    });
  });

  it('reports actionable Character and Enemy dangling references', () => {
    const report = validateRelationAudits({
      specialEffects: [
        { code: 'unresolved-skill', identity: '1001:999', detail: 'SkillID 999 is missing' }
      ],
      enemies: {
        canonicalJoin: { resolved: 1, missing: [] },
        unresolvedSummons: [],
        unresolvedSkills: [{ enemyId: '100', skillId: '999' }],
        unresolvedExtraEffects: []
      }
    });
    expect(report.errors.map(({ code }) => code)).toEqual(['unresolved-skill', 'skill-fk']);
    expect(report.errors[1]?.message).toContain('MonsterSkillConfig=999');
  });

  it('rejects dangling routes, Endgame enemy FKs and Search shard targets', () => {
    const danglingRoute = fixture();
    danglingRoute.manifest.routes.enemies = [];
    expect(
      validateProductProjection(danglingRoute.manifest, danglingRoute.projection).errors
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ domain: 'route', code: 'catalog-detail' })])
    );

    const danglingEnemy = fixture();
    danglingEnemy.projection.endgame.moc.groups[0].encounters[0].battles[0].stages[0].waveModel = {
      kind: 'fixed',
      waves: [{ wave: 1, enemies: [{ ...occurrence(), monsterId: 999 }] }]
    };
    expect(
      validateProductProjection(danglingEnemy.manifest, danglingEnemy.projection).errors
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ domain: 'endgame', code: 'enemy-fk' })])
    );

    const danglingShard = fixture();
    danglingShard.projection.occurrenceShards = {};
    expect(
      validateProductProjection(danglingShard.manifest, danglingShard.projection).errors
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: 'search', code: 'shard-inventory' })
      ])
    );
  });

  it('distinguishes duplicate, wrong-owner and missing graph identities', () => {
    const duplicate = fixture();
    duplicate.projection.details.enemies[0].monsters.push(
      duplicate.projection.details.enemies[0].monsters[0]
    );
    expect(validateProductProjection(duplicate.manifest, duplicate.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'duplicate-monster' })])
    );

    const wrongOwner = fixture();
    wrongOwner.projection.details.enemies[0].monsters[0].monsterTemplateId = '999';
    expect(validateProductProjection(wrongOwner.manifest, wrongOwner.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'monster-owner' })])
    );

    const missing = fixture();
    missing.projection.details.enemies[0].defaultMonsterId = '999';
    expect(validateProductProjection(missing.manifest, missing.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'default-fk' })])
    );
  });

  it('rejects dangling Search documents, locators and shard periods', () => {
    const document = fixture();
    document.projection.search.documents[0].target.id = '999';
    expect(validateProductProjection(document.manifest, document.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'target' })])
    );

    const locator = fixture();
    locator.projection.search.endgameTargets[0].occurrences[0].locator.encounterId = 'missing';
    expect(validateProductProjection(locator.manifest, locator.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'locator' })])
    );

    const period = fixture();
    period.projection.occurrenceShards['100'].periods[0].period.groupId = 999;
    expect(validateProductProjection(period.manifest, period.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'shard-periods' })])
    );
  });

  it('rejects invalid numeric states and unsupported reachable discriminants', () => {
    const numeric = fixture();
    const stage = numeric.projection.endgame.moc.groups[0].encounters[0].battles[0].stages[0];
    if (stage.waveModel.kind !== 'fixed') throw new Error('test fixture mismatch');
    stage.waveModel.waves[0].enemies[0].hp.hpBase = 'NaN' as never;
    expect(validateProductProjection(numeric.manifest, numeric.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ domain: 'endgame', code: 'numeric' })])
    );

    const schema = fixture();
    schema.projection.endgame.moc.groups[0].encounters[0].battles[0].stages[0].waveModel = {
      kind: 'future-wave'
    } as never;
    expect(validateProductProjection(schema.manifest, schema.projection).errors[0]).toMatchObject({
      domain: 'endgame',
      code: 'wave-discriminant'
    });
  });

  it('rejects Infinity, malformed decimals, unordered levels and invalid counts', () => {
    const infinity = fixture();
    addCharacterFixture(infinity.manifest, infinity.projection, '2001');
    infinity.projection.details.characters[0].baseStats.stages[0].hp.base = Infinity;
    expect(validateProductProjection(infinity.manifest, infinity.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'stat-progression' })])
    );

    const malformed = fixture();
    const malformedStage =
      malformed.projection.endgame.moc.groups[0].encounters[0].battles[0].stages[0];
    if (malformedStage.waveModel.kind !== 'fixed') throw new Error('test fixture mismatch');
    malformedStage.waveModel.waves[0].enemies[0].hp.instanceRatio = '1.2.3' as never;
    expect(validateProductProjection(malformed.manifest, malformed.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'numeric' })])
    );

    const levels = fixture();
    levels.projection.details.enemies[0].monsters[0].stats.levels = [
      { level: 2 },
      { level: 1 },
      { level: 1 }
    ] as never;
    expect(validateProductProjection(levels.manifest, levels.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'stat-progression' })])
    );

    const requiredField = fixture();
    delete (
      requiredField.projection.details.enemies[0].monsters[0].modifiers as unknown as Record<
        string,
        unknown
      >
    ).hp;
    expect(
      validateProductProjection(requiredField.manifest, requiredField.projection).errors
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'required-field' })]));

    const count = fixture();
    count.projection.occurrenceShards['100'].occurrences[
      Object.keys(count.projection.occurrenceShards['100'].occurrences)[0]
    ].occurrence.count = 0;
    expect(validateProductProjection(count.manifest, count.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'shard-occurrence' })])
    );
  });

  it('allows signed decimal sentinels and additive unused fields', () => {
    const { manifest, projection } = fixture();
    const stage = projection.endgame.moc.groups[0].encounters[0].battles[0].stages[0];
    if (stage.waveModel.kind !== 'fixed') throw new Error('test fixture mismatch');
    Object.assign(stage.waveModel.waves[0].enemies[0], { futureOptionalMetadata: true });
    Object.assign(stage.waveModel.waves[0].enemies[0].hp, {
      hpBase: '-1',
      instanceRatio: '0',
      baseEncounterMaxHpPerBar: '0'
    });
    expect(validateProductProjection(manifest, projection).errors).toEqual([]);
  });

  it('rejects malformed or reversed Shanghai schedules without requiring a schedule', () => {
    const absent = fixture();
    delete absent.projection.endgame.moc.groups[0].schedule;
    expect(validateProductProjection(absent.manifest, absent.projection).errors).toEqual([]);

    const reversed = fixture();
    reversed.projection.endgame.moc.groups[0].schedule = {
      begin: '2026-02-01 00:00:00',
      end: '2026-01-01 00:00:00'
    };
    expect(validateProductProjection(reversed.manifest, reversed.projection).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'schedule' })])
    );
  });

  it('fails unsupported visible skill and Relic discriminants but permits hidden skill drift', () => {
    expect(() =>
      classifyProductSkill(
        { AttackType: 'FutureAttack' },
        { source: 'AvatarSkillConfig', skillId: '999', productReachable: true }
      )
    ).toThrow(/table=AvatarSkillConfig record=999.*FutureAttack/);
    const diagnostic = vi.fn();
    expect(
      classifyProductSkill(
        Object.assign({ AttackType: 'FutureAttack' }, { ExtraOptionalField: true }),
        {
          source: 'AvatarSkillConfig',
          skillId: '999',
          productReachable: false,
          onUnsupportedHidden: diagnostic
        }
      )
    ).toBeUndefined();
    expect(diagnostic).toHaveBeenCalledOnce();
    expect(parseRelicEffectRequirement(4, '101')).toBe(4);
    expect(() => parseRelicEffectRequirement(3, '101')).toThrow(
      /table=RelicSetSkillConfig record=101 field=RequireNum.*supported=2,4/
    );
  });

  it('bounds failure samples while retaining the total error count', () => {
    const errors = Array.from({ length: 21 }, (_, index) => ({
      severity: 'error' as const,
      domain: 'test',
      code: 'broken',
      entityId: String(index),
      message: 'broken'
    }));
    expect(() => assertValidationReport({ errors, warnings: [] }, 'robustness')).toThrow(
      /21 error\(s\)[\s\S]*1 additional error/
    );
  });
});
