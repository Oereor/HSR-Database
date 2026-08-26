import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  EndgameDatasetByMode,
  EndgameBattleSlot,
  EndgameMode,
  EndgameStage,
  EnemyOccurrence
} from '../../src/lib/domain/endgame';
import {
  buildUniqueIndex,
  resolveEndgameSchedule,
  type EndgameAudit
} from '../../scripts/data/endgame';
import { createMazeBuffResolver, type MazeBuffRow } from '../../scripts/data/maze-buffs';
import { createAsBossGuideResolver } from '../../scripts/data/as-boss-guides';
import type { TextResolver } from '../../scripts/data/localization';
import { gameTextToPlain } from '../../src/lib/domain/game-text';
import {
  addDecimals,
  decimalEquals,
  decimalOf,
  internalStanceToToughness,
  multiplyDecimals,
  parseDecimal
} from '../../scripts/data/decimal';
import { auditRoot, generatedRoot } from '../../scripts/data/paths';
import {
  PURE_FICTION_WAVE_HP_ABILITY,
  resolvePureFictionFinalHp,
  resolvePureFictionHpModifier
} from '../../scripts/data/pure-fiction-hp';

const modes: EndgameMode[] = ['moc', 'pf', 'as', 'aa'];

async function dataset<TMode extends EndgameMode>(
  mode: TMode
): Promise<EndgameDatasetByMode[TMode]> {
  return JSON.parse(
    await readFile(path.join(generatedRoot, 'endgame', `${mode}.json`), 'utf8')
  ) as EndgameDatasetByMode[TMode];
}

function occurrences(stage: EndgameStage): EnemyOccurrence[] {
  return stage.waveModel.kind === 'fixed'
    ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
    : stage.waveModel.waves.flatMap((wave) =>
        wave.monsterGroups.flatMap((group) => group.orderedEnemies)
      );
}

async function fixture(
  mode: EndgameMode,
  groupId: number,
  configId: number,
  stageId: number,
  monsterId: number
): Promise<{ stage: EndgameStage; occurrence: EnemyOccurrence }> {
  const data = await dataset(mode);
  const stage = data.groups
    .find((group) => group.groupId === groupId)
    ?.encounters.filter((encounter) => encounter.configId === configId)
    .flatMap((encounter) => encounter.battles)
    .flatMap((battle) => battle.stages)
    .find((item) => item.stageId === stageId);
  const occurrence = stage && occurrences(stage).find((item) => item.monsterId === monsterId);
  if (!stage || !occurrence) throw new Error('fixture not found');
  return { stage, occurrence };
}

describe('Endgame 精确十进制', () => {
  it('保留源精度和乘积尾随零', () => {
    expect(
      multiplyDecimals([
        parseDecimal('4650'),
        parseDecimal('1'),
        parseDecimal('375.4385'),
        parseDecimal('6.5')
      ])
    ).toBe('11347628.66250');
    expect(decimalEquals(parseDecimal('1.0'), parseDecimal('1.000'))).toBe(true);
  });

  it('拒绝 number 或缺少 Value 的输入', () => {
    expect(() => parseDecimal(1)).toThrow(/十进制字符串/);
    expect(() => decimalOf({ Value: 1 }, 'fixture')).toThrow(/十进制字符串/);
    expect(() => decimalOf({}, 'fixture')).toThrow(/缺少 Value/);
  });

  it('使用 BigInt 计算大数而不经过浮点数', () => {
    expect(multiplyDecimals([parseDecimal('9999999999999999.99'), parseDecimal('8')])).toBe(
      '79999999999999999.92'
    );
  });

  it('使用 BigInt 对不同精度的十进制执行加法', () => {
    expect(addDecimals([parseDecimal('120.50'), parseDecimal('-20.5')])).toBe('100.00');
    expect(() => addDecimals([])).toThrow(/至少需要一个加数/);
  });

  it.each([
    ['300', '100'],
    ['900', '300'],
    ['1440', '480'],
    ['570', '190'],
    ['810', '270']
  ])('将 internal stance %s 精确换算为玩家韧性 %s', (internal, expected) => {
    expect(internalStanceToToughness(parseDecimal(internal))).toBe(expected);
  });

  it('无法有限表示的三分之一不进行浮点近似', () => {
    expect(internalStanceToToughness(parseDecimal('10'))).toBeUndefined();
  });
});

describe('MazeBuff 共享配置解析', () => {
  const fakeText = (values: Record<string, string>): TextResolver =>
    ({
      resolveHash: (hash: string) => values[hash] ?? '',
      resolveRef: (ref: unknown) => {
        const hash =
          ref && typeof ref === 'object' && 'Hash' in ref
            ? String((ref as { Hash: unknown }).Hash)
            : '';
        return values[hash] ?? '';
      },
      resolveSymbolic: () => '',
      getDiagnostics: () => ({
        'invalid-reference': { count: 0, samples: [] },
        'unresolved-hash': { count: 0, samples: [] },
        'unresolved-symbolic-key': { count: 0, samples: [] }
      })
    }) as TextResolver;

  const issueSink = (warnings: string[]) => ({
    fail(code: string, message: string): never {
      throw new Error(`${code}: ${message}`);
    },
    warn(code: string): void {
      warnings.push(code);
    }
  });

  it('保留无损参数、markup、hash 与未使用参数审计', () => {
    const warnings: string[] = [];
    const rows: MazeBuffRow[] = [
      {
        ID: 1,
        Lv: 1,
        BuffName: { Hash: '11' },
        BuffDesc: { Hash: '12' },
        ParamList: [{ Value: '0.8' }, { Value: '1' }, { Value: '7' }],
        BuffIcon: 'SpriteOutput/BuffIcon/Test.png',
        InBattleBindingKey: 'Fixture_Binding'
      }
    ];
    const resolver = createMazeBuffResolver(
      rows,
      fakeText({
        '11': '记忆紊流',
        '12': '<color=#f29e38ff>伤害提高#1[i]%</color>，持续#2[i]回合。'
      }),
      issueSink(warnings)
    );
    expect(resolver.resolve(1, { requireDisplay: true, context: { mode: 'moc' } })).toEqual({
      id: 1,
      name: '记忆紊流',
      nameHash: '11',
      description: '<color=#f29e38ff>伤害提高80%</color>，持续1回合。',
      descriptionHash: '12',
      params: ['0.8', '1', '7'],
      upstreamIconPath: 'SpriteOutput/BuffIcon/Test.png',
      bindingKey: 'Fixture_Binding'
    });
    expect(warnings).toEqual(['unused-maze-buff-param']);
    expect(resolver.getAudit()).toMatchObject({
      distinctReferenced: 1,
      resolved: 1,
      displayReady: 1,
      missingLocalization: 0,
      missingIconPath: 0,
      missingDescriptionParams: 0,
      unusedParams: 1
    });
  });

  it('拒绝 unresolved、重复 Lv=1、缺参和 display-required 缺文本', () => {
    const missing = createMazeBuffResolver(
      [{ ID: 1, Lv: 1, BuffName: { Hash: '11' }, BuffDesc: { Hash: '12' } }],
      fakeText({}),
      issueSink([])
    );
    expect(() => missing.resolve(999, { requireDisplay: true, context: { mode: 'moc' } })).toThrow(
      /unresolved-maze-buff/
    );
    expect(() => missing.resolve(1, { requireDisplay: true, context: { mode: 'moc' } })).toThrow(
      /maze-buff-not-display-ready/
    );

    const duplicate = createMazeBuffResolver(
      [
        { ID: 2, Lv: 1 },
        { ID: 2, Lv: 1 }
      ],
      fakeText({}),
      issueSink([])
    );
    expect(() => duplicate.resolve(2, { requireDisplay: false, context: { mode: 'pf' } })).toThrow(
      /ambiguous-maze-buff-level/
    );

    const missingParam = createMazeBuffResolver(
      [
        {
          ID: 3,
          Lv: 1,
          BuffName: { Hash: '31' },
          BuffDesc: { Hash: '32' },
          ParamList: [{ Value: '1' }]
        }
      ],
      fakeText({ '31': '测试', '32': '#2[i]%' }),
      issueSink([])
    );
    expect(() =>
      missingParam.resolve(3, { requireDisplay: true, context: { mode: 'aa' } })
    ).toThrow(/invalid-maze-buff-placeholder/);
  });
});

describe('AS 首领特性配置解析', () => {
  const fakeText = (values: Record<string, string>): TextResolver =>
    ({
      resolveHash: (hash: string) => values[hash] ?? '',
      resolveRef: (ref: unknown) => {
        const hash =
          ref && typeof ref === 'object' && 'Hash' in ref
            ? String((ref as { Hash: unknown }).Hash)
            : '';
        return values[hash] ?? '';
      },
      resolveSymbolic: () => '',
      getDiagnostics: () => ({
        'invalid-reference': { count: 0, samples: [] },
        'unresolved-hash': { count: 0, samples: [] },
        'unresolved-symbolic-key': { count: 0, samples: [] }
      })
    }) as TextResolver;

  const battle = {
    slot: 1,
    stages: [
      {
        waveModel: { kind: 'fixed', waves: [{ wave: 1, enemies: [{ monsterId: 10 }] }] }
      }
    ]
  } as unknown as EndgameBattleSlot;

  it('按 difficulty、源顺序和显式 slot binding 解析并保留 markup', () => {
    const warnings: string[] = [];
    const resolver = createAsBossGuideResolver(
      {
        mazeExtras: [{ ID: 100, MonsterID1: 10 }],
        guides: [{ MonsterID: 10, Difficulty: 3, TagList: [1, 2, 3], DifficultyList: [1, 3, 4] }],
        tags: [
          {
            TagID: 1,
            TagName: { Hash: '11' },
            TagBriefDescription: { Hash: '12' },
            ParameterList: ['0.6', '9'],
            EffectID: [101]
          },
          {
            TagID: 2,
            TagName: { Hash: '21' },
            TagBriefDescription: { Hash: '22' },
            EffectID: [102, 103]
          },
          { TagID: 3, TagName: { Hash: '31' }, TagBriefDescription: { Hash: '32' } }
        ],
        extraEffects: [
          {
            ExtraEffectID: 101,
            ExtraEffectName: { Hash: '1011' },
            ExtraEffectDesc: { Hash: '1012' }
          },
          {
            ExtraEffectID: 102,
            ExtraEffectName: { Hash: '1021' },
            ExtraEffectDesc: { Hash: '1022' }
          },
          {
            ExtraEffectID: 103,
            ExtraEffectName: { Hash: '1031' },
            ExtraEffectDesc: { Hash: '1032' }
          }
        ]
      },
      fakeText({
        '11': '特性一',
        '12': '<color=#fff>#1%</color>',
        '21': '特性二',
        '22': '描述二',
        '1011': '效果一',
        '1012': '效果描述一',
        '1021': '效果二',
        '1022': '效果描述二',
        '1031': '效果三',
        '1032': '<color=#fff>效果描述三</color>'
      }),
      { warn: (code) => warnings.push(code) }
    );
    const guides = resolver.resolveEncounter({
      groupId: 1,
      configId: 100,
      difficulty: 3,
      battles: [battle]
    });
    expect(guides).toHaveLength(1);
    expect(guides[0]?.traits.map(({ tagId }) => tagId)).toEqual([1, 2]);
    expect(guides[0]?.traits[0]).toMatchObject({
      order: 1,
      requiredDifficulty: 1,
      description: '<color=#fff>60%</color>',
      params: ['0.6', '9'],
      provenance: { table: 'MonsterGuideConfig', ownerId: 10, arrayIndex: 0 }
    });
    expect(warnings).toContain('unused-as-boss-trait-param');
    expect(
      guides[0]?.traits.map((trait) => trait.linkedEffects.map((effect) => effect.id))
    ).toEqual([['101'], ['102', '103']]);
    expect(guides[0]?.traits[1]?.linkedEffects[1]?.description).toBe(
      '<color=#fff>效果描述三</color>'
    );
  });

  it('对缺关系、重复 Tag、缺本地化和缺参安全省略，并拒绝重复核心主键', () => {
    expect(() =>
      createAsBossGuideResolver(
        {
          mazeExtras: [
            { ID: 100, MonsterID1: 10 },
            { ID: 100, MonsterID1: 10 }
          ],
          guides: [],
          tags: [],
          extraEffects: []
        },
        fakeText({}),
        { warn: () => undefined }
      )
    ).toThrow(/重复主键/);

    const warnings: string[] = [];
    const resolver = createAsBossGuideResolver(
      {
        mazeExtras: [{ ID: 100, MonsterID1: 10 }],
        guides: [
          {
            MonsterID: 10,
            Difficulty: 4,
            TagList: [3, 3, 1, 2],
            DifficultyList: [5, 1, 1, 1]
          }
        ],
        tags: [
          { TagID: 1, TagName: { Hash: '11' }, TagBriefDescription: { Hash: '12' } },
          {
            TagID: 2,
            TagName: { Hash: '21' },
            TagBriefDescription: { Hash: '22' },
            ParameterList: ['1']
          },
          { TagID: 3, TagName: { Hash: '31' }, TagBriefDescription: { Hash: '32' } }
        ],
        extraEffects: []
      },
      fakeText({
        '11': '',
        '12': '缺名称',
        '21': '缺参',
        '22': '#2%',
        '31': '不应采用后出现的重复项',
        '32': '描述'
      }),
      { warn: (code) => warnings.push(code) }
    );
    expect(
      resolver.resolveEncounter({ groupId: 1, configId: 100, difficulty: 4, battles: [battle] })[0]
        ?.traits
    ).toEqual([]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        'missing-as-boss-trait-localization',
        'duplicate-as-boss-trait',
        'invalid-as-boss-trait-placeholder'
      ])
    );
    expect(
      resolver.resolveEncounter({ groupId: 1, configId: 999, difficulty: 4, battles: [battle] })
    ).toEqual([]);
    expect(warnings).toContain('missing-as-boss-maze-extra');
  });

  it('未解析 EffectID 只记录诊断，不向关卡效果泄露原始 ID', () => {
    const warnings: string[] = [];
    const resolver = createAsBossGuideResolver(
      {
        mazeExtras: [{ ID: 100, MonsterID1: 10 }],
        guides: [{ MonsterID: 10, Difficulty: 4, TagList: [1], DifficultyList: [1] }],
        tags: [
          {
            TagID: 1,
            TagName: { Hash: '11' },
            TagBriefDescription: { Hash: '12' },
            EffectID: [999]
          }
        ],
        extraEffects: []
      },
      fakeText({ '11': '关卡效果', '12': '原始描述' }),
      { warn: (code) => warnings.push(code) }
    );
    const trait = resolver.resolveEncounter({
      groupId: 1,
      configId: 100,
      difficulty: 4,
      battles: [battle]
    })[0]?.traits[0];
    expect(trait?.linkedEffects).toEqual([]);
    expect(JSON.stringify(trait)).not.toContain('999');
    expect(warnings).toContain('unresolved-as-stage-effect-extra-effect');
    expect(resolver.getAudit()).toMatchObject({
      linkedEffectRelations: 1,
      displayReadyLinkedEffects: 0,
      omittedLinkedEffects: 1
    });
  });
});

describe('PF HP resolver', () => {
  const hpInput = {
    hpBase: parseDecimal('10'),
    instanceRatio: parseDecimal('1'),
    levelRatio: parseDecimal('1'),
    eliteRatio: parseDecimal('1'),
    baseEncounterMaxHpPerBar: parseDecimal('10')
  };

  it('普通怪在 .5 临界值四舍五入，leader 截断', () => {
    const modifier = resolvePureFictionHpModifier(PURE_FICTION_WAVE_HP_ABILITY, [
      parseDecimal('0'),
      parseDecimal('0.05')
    ]);
    expect(resolvePureFictionFinalHp({ ...hpInput, rank: 'Minion', modifier }).final).toMatchObject(
      {
        status: 'resolved',
        maxHpPerBar: '11',
        rounding: 'half-up'
      }
    );
    expect(
      resolvePureFictionFinalHp({ ...hpInput, rank: 'LittleBoss', modifier }).final
    ).toMatchObject({ status: 'resolved', maxHpPerBar: '10', rounding: 'truncate' });
  });

  it('无 ability/空参数按 identity 走 PF 精度和取整', () => {
    const modifier = resolvePureFictionHpModifier(undefined, []);
    expect(resolvePureFictionFinalHp({ ...hpInput, rank: 'Minion', modifier }).final).toEqual({
      status: 'resolved',
      maxHpPerBar: '10',
      source: 'pure-fiction-wave',
      rounding: 'half-up'
    });
  });

  it.each([
    [undefined, [parseDecimal('1')], 'pf-params-without-ability'],
    ['Unknown_Ability', [parseDecimal('0'), parseDecimal('4')], 'unsupported-pf-wave-ability'],
    [PURE_FICTION_WAVE_HP_ABILITY, [], 'pf-ability-without-params'],
    [PURE_FICTION_WAVE_HP_ABILITY, [parseDecimal('0')], 'invalid-pf-wave-param-count'],
    [
      PURE_FICTION_WAVE_HP_ABILITY,
      [parseDecimal('0'), '-2' as ReturnType<typeof parseDecimal>],
      'invalid-pf-hp-added-ratio'
    ],
    [
      PURE_FICTION_WAVE_HP_ABILITY,
      [parseDecimal('0'), 'NaN' as ReturnType<typeof parseDecimal>],
      'invalid-pf-hp-added-ratio'
    ]
  ] as const)('非法或未知 wave modifier 返回 unresolved：%s', (ability, params, reason) => {
    const modifier = resolvePureFictionHpModifier(ability, params);
    expect(modifier).toMatchObject({ status: 'unresolved', reason });
    expect(resolvePureFictionFinalHp({ ...hpInput, rank: 'Minion', modifier }).final).toEqual({
      status: 'unresolved',
      reason
    });
  });
});

describe('Endgame schedule 容错', () => {
  it.each(['moc', 'pf', 'as'] as const)('%s 缺少 schedule 时记录 warning 并继续', (mode) => {
    const warnings: Array<{ code: string; context: Record<string, unknown> }> = [];
    const schedule = resolveEndgameSchedule(
      mode,
      { GroupID: 1034, ScheduleDataID: 291015 },
      new Map(),
      {
        warn: (code, _message, context) => warnings.push({ code, context })
      }
    );

    expect(schedule).toBeUndefined();
    expect(warnings).toEqual([
      {
        code: 'missing-schedule',
        context: { mode, groupId: 1034, scheduleId: 291015 }
      }
    ]);
  });

  it('返回已经存在的 schedule 且不记录 warning', () => {
    const warnings: string[] = [];
    const expected = {
      ID: 201034,
      BeginTime: '2026-08-17 04:00:00',
      EndTime: '2026-09-28 04:00:00'
    };

    expect(
      resolveEndgameSchedule(
        'moc',
        { GroupID: 1034, ScheduleDataID: 201034 },
        new Map([['201034', expected]]),
        {
          warn: (code) => warnings.push(code)
        }
      )
    ).toBe(expected);
    expect(warnings).toEqual([]);
  });
});

describe('Endgame 真实数据管线', () => {
  it('四个模式使用 schema 21 且 fixed/spawn 模型分离', async () => {
    const all = await Promise.all(modes.map(dataset));
    expect(all.every((item) => item.schemaVersion === 22)).toBe(true);
    expect((await fixture('moc', 1034, 5312, 30124121, 3024020)).stage.waveModel.kind).toBe(
      'fixed'
    );
    expect((await fixture('pf', 2025, 20254, 30323041, 100402014)).stage.waveModel.kind).toBe(
      'spawn-sequence'
    );
    expect((await fixture('as', 3019, 30194, 420484, 401401304)).stage.waveModel.kind).toBe(
      'fixed'
    );
    expect((await fixture('aa', 8, 804, 30508022, 501403002)).stage.waveModel.kind).toBe(
      'spawn-sequence'
    );
  });

  it('四模式分别输出玩家机制且不共享 gameplay modifier 模型', async () => {
    const moc = await dataset('moc');
    const turbulence = moc.groups
      .find((group) => group.groupId === 1034)
      ?.encounters.find((encounter) => encounter.configId === 5312)?.memoryTurbulence;
    expect(turbulence).toMatchObject({
      buff: { id: 3030147, name: '记忆紊流', params: ['0.8', '1'] },
      provenance: { table: 'ChallengeMazeConfig', ownerId: 5312, field: 'MazeBuffID' },
      groupReference: { mazeBuffId: 3030147 }
    });
    expect(gameTextToPlain(turbulence?.buff.description)).toContain('80%');
    expect(gameTextToPlain(turbulence?.buff.description)).toContain('1回合');

    const pf = await dataset('pf');
    const pfGroup = pf.groups.find((group) => group.groupId === 2025)!;
    expect(pfGroup.groupBaseMechanic).toMatchObject({ mazeBuffId: 3031230 });
    expect(pfGroup.groupBaseMechanic?.display).toBeUndefined();
    expect(
      pfGroup.encounters.find((encounter) => encounter.configId === 20254)?.baseMechanic
    ).toMatchObject({ mazeBuffId: 3031230 });
    expect(pfGroup.battleWillMechanics.map(({ buff }) => [buff.id, buff.name])).toEqual([
      [3031232, '追加攻击'],
      [3031233, '战熄潮平'],
      [3031234, '战意汹涌']
    ]);
    expect(
      pfGroup.cacophony?.options.map(({ order, buff }) => [order, buff.id, buff.name])
    ).toEqual([
      [1, 3031363, '暴言'],
      [2, 3031364, '高论'],
      [3, 3031365, '快嘴']
    ]);

    const shadow = await dataset('as');
    const shadowGroup = shadow.groups.find((group) => group.groupId === 3020)!;
    const aftertaste = shadowGroup.encounters.find(
      (encounter) => encounter.configId === 30204
    )?.aftertaste;
    expect(aftertaste?.buff).toMatchObject({ id: 3110018, name: '末法余烬' });
    expect(aftertaste?.stageBindings.map(({ slot, mazeBuffId }) => [slot, mazeBuffId])).toEqual([
      [1, 3110018],
      [2, 3110018],
      [3, 3110018]
    ]);

    const shadowEncounter = shadowGroup.encounters.find(
      (encounter) => encounter.configId === 30204
    )!;
    expect(shadowEncounter.bossGuides).toHaveLength(3);
    expect(shadowEncounter.bossGuides[0]).toMatchObject({
      key: 'as:30204:MonsterID1',
      slot: 1,
      guideMonsterId: 202401604,
      difficulty: 4,
      provenance: {
        table: 'ChallengeBossMazeExtra',
        ownerId: 30204,
        field: 'MonsterID1'
      }
    });
    expect(shadowEncounter.bossGuides[0]?.traits.map(({ tagId, name }) => [tagId, name])).toEqual([
      [101701, '坚防守备'],
      [101702, '丰亨豫大'],
      [101703, '如鹿添翼'],
      [101704, '仙光夺目']
    ]);
    expect(gameTextToPlain(shadowEncounter.bossGuides[0]?.traits[0]?.description)).toContain('50%');
    expect(gameTextToPlain(shadowEncounter.bossGuides[0]?.traits[0]?.description)).toContain(
      '100%'
    );
    expect(
      shadowEncounter.bossGuides[0]?.traits.map((trait) =>
        trait.linkedEffects.map((effect) => effect.id)
      )
    ).toEqual([[], [], [], ['220240163']]);
    expect(
      shadowEncounter.bossGuides[2]?.traits
        .find((trait) => trait.tagId === 101602)
        ?.linkedEffects.map((effect) => [effect.id, effect.name])
    ).toEqual([
      ['501401001', '连麦PK'],
      ['70000318', '韧性锁止']
    ]);

    const difficultyTraitCounts = shadowGroup.encounters.map((encounter) => [
      encounter.ordinal,
      encounter.bossGuides[0]?.traits.length
    ]);
    expect(difficultyTraitCounts).toEqual([
      [1, 2],
      [2, 2],
      [3, 3],
      [4, 4]
    ]);

    const malformedEncounter = (await dataset('as')).groups
      .find((group) => group.groupId === 3003)
      ?.encounters.find((encounter) => encounter.configId === 30034);
    expect(
      malformedEncounter?.bossGuides
        .find((guide) => guide.slot === 2)
        ?.traits.map(({ tagId }) => tagId)
    ).toEqual([100601, 100602, 100604]);

    const mismatchEncounter = (await dataset('as')).groups
      .find((group) => group.groupId === 3011)
      ?.encounters.find((encounter) => encounter.configId === 30114);
    expect(mismatchEncounter?.bossGuides.find((guide) => guide.slot === 2)).toMatchObject({
      guideMonsterId: 203302204,
      slot: 2,
      traits: expect.any(Array)
    });
    expect(
      shadowGroup.axiomSets.map((set) => [set.slot, set.options.map(({ buff }) => buff.id)])
    ).toEqual([
      [1, [3111092, 3111065, 3111089]],
      [2, [3111093, 3111080, 3111058]],
      [3, [3111089, 3111079, 3111068]]
    ]);

    const arbitration = await dataset('aa');
    const arbitrationGroup = arbitration.groups.find((group) => group.groupId === 8)!;
    const normal = arbitrationGroup.encounters.find((encounter) => encounter.id === '804:normal')!;
    const hard = arbitrationGroup.encounters.find((encounter) => encounter.id === '804:hard')!;
    expect(normal.traits.map(({ buff }) => buff.id)).toEqual([3033069, 3033051]);
    expect(hard.traits.map(({ buff }) => buff.id)).toEqual([3033070, 3033052]);
    expect(normal.judgmentQuadrantKey).toBe('aa:804:BuffList');
    expect(hard.judgmentQuadrantKey).toBe(normal.judgmentQuadrantKey);
    expect(
      arbitrationGroup.judgmentQuadrant?.options.map(({ order, buff }) => [order, buff.id])
    ).toEqual([
      [1, 3033066],
      [2, 3033068],
      [3, 3033067]
    ]);
  });

  it('新增字段之外的完整 Endgame hierarchy 与敌方数据摘要保持不变', async () => {
    const expected = {
      moc: 'f0c1b03e4844fcdeaf242fec867403d97f822a6a8a97a2b2cf484709c2010833',
      pf: 'cb34270ddf74c8e06304b47b0725458ca5c1a20eee5f9b14390b5170c7e070d9',
      as: '015183494e922c2b6d9a3a0f720870457f3210aaaa12628dabd46aea931439f2',
      aa: 'f75ed2b81b95884881683ec394d6c054c39d52ecc990a84773cc3a0c5e9af155'
    } as const;
    const groupFields: Record<EndgameMode, string[]> = {
      moc: [],
      pf: ['groupBaseMechanic', 'battleWillMechanics', 'cacophony'],
      as: ['axiomSets'],
      aa: ['judgmentQuadrant']
    };
    const encounterFields: Record<EndgameMode, string[]> = {
      moc: ['memoryTurbulence'],
      pf: ['baseMechanic'],
      as: ['aftertaste', 'bossGuides'],
      aa: ['traits', 'judgmentQuadrantKey']
    };
    for (const mode of modes) {
      const data = await dataset(mode);
      for (const group of data.groups) {
        const groupRecord = group as unknown as Record<string, unknown>;
        for (const field of groupFields[mode]) delete groupRecord[field];
        for (const encounter of group.encounters) {
          const encounterRecord = encounter as unknown as Record<string, unknown>;
          for (const field of encounterFields[mode]) delete encounterRecord[field];
        }
      }
      expect(createHash('sha256').update(JSON.stringify(data.groups)).digest('hex')).toBe(
        expected[mode]
      );
    }
  });

  it.each([
    ['moc', 1034, 5312, 30124121, 3024020, ['4650', '1', '375.4385', '6.5'], '11347628.66250'],
    ['pf', 2025, 20254, 30323041, 100402014, ['1023', '7.5', '188.2636', '1'], '1444452.47100'],
    ['as', 3019, 30194, 420484, 401401304, ['32550', '1', '236.53471', '1.9'], '14628489.139950'],
    [
      'aa',
      8,
      804,
      30508022,
      501403002,
      ['3022.5', '1.353846', '1938.7634', '8'],
      '63467351.45020015200'
    ]
  ] as const)(
    '%s 的已验证 HP 因子和乘积保持精确',
    async (mode, groupId, configId, stageId, monsterId, factors, expected) => {
      const { occurrence } = await fixture(mode, groupId, configId, stageId, monsterId);
      expect([
        occurrence.hp.hpBase,
        occurrence.hp.instanceRatio,
        occurrence.hp.levelRatio,
        occurrence.hp.eliteRatio
      ]).toEqual(factors);
      expect(occurrence.hp.baseEncounterMaxHpPerBar).toBe(expected);
    }
  );

  it('AA 使用实际生成 MonsterID，并仅将通用 ID 作为 preview', async () => {
    const { stage, occurrence } = await fixture('aa', 7, 704, 30507021, 802501003);
    expect(occurrence.monsterTemplateId).toBe(8025010);
    expect(stage.previewMonsterIds).toContain(5012010);
    expect(occurrences(stage).some((item) => item.monsterId === 5012010)).toBe(false);
  });

  it('PF 保留 spawn 顺序与重复 MonsterID', async () => {
    const { stage } = await fixture('pf', 2025, 20254, 30323041, 100402014);
    if (stage.waveModel.kind !== 'spawn-sequence') throw new Error('expected spawn sequence');
    const group = stage.waveModel.waves
      .find((wave) => wave.waveId === 303230413)
      ?.monsterGroups.find((item) => item.monsterGroupId === 303230413);
    const ids = group?.orderedEnemies.map((item) => item.monsterId) ?? [];
    expect(ids).toHaveLength(41);
    expect(ids.slice(0, 5)).toEqual([4012040, 1022010, 100402014, 4012040, 1022010]);
    expect(ids.filter((id) => id === 4012040).length).toBeGreaterThan(1);
  });

  it.each([
    ['moc', 1034, 5312],
    ['pf', 2025, 20254],
    ['as', 3020, 30204]
  ] as const)('%s Tierce 生成三个 battle slot', async (mode, groupId, configId) => {
    const data = await dataset(mode);
    const encounter = data.groups
      .find((group) => group.groupId === groupId)
      ?.encounters.find((item) => item.configId === configId);
    expect(encounter?.battles.map((battle) => battle.slot)).toEqual([1, 2, 3]);
  });

  it('同一 MonsterID 的最终 HP 由关卡上下文决定', async () => {
    const data = await dataset('moc');
    const matches = data.groups
      .flatMap((group) => group.encounters)
      .flatMap((encounter) => encounter.battles)
      .flatMap((battle) => battle.stages)
      .flatMap((stage) => occurrences(stage).map((occurrence) => ({ stage, occurrence })))
      .filter(({ occurrence }) => occurrence.monsterId === 8012010);
    const low = matches.find(({ stage }) => stage.stageId === 30001011);
    const high = matches.find(({ stage }) => stage.stageId === 30001092);
    expect(low?.occurrence.hp.baseEncounterMaxHpPerBar).toBe('850.8113370');
    expect(high?.occurrence.hp.baseEncounterMaxHpPerBar).toBe('3941.8408980');
  });

  it.each([
    [30323041, 5012010, '218856'],
    [30323041, 5012020, '196971'],
    [30323041, 501211002, '525255'],
    [30323041, 100402014, '57778097'],
    [30323042, 5014023, '52000287'],
    [30323043, 202401406, '72222634']
  ] as const)('PF Stage %s MonsterID %s 的最终 HP 为 %s', async (stageId, monsterId, expected) => {
    const final = (await fixture('pf', 2025, 20254, stageId, monsterId)).occurrence.hp.final;
    expect(final).toMatchObject({ status: 'resolved', maxHpPerBar: expected });
  });

  it('PF wave modifier 对同一波的非基准敌人同样生效，并保留具体实例 ID', async () => {
    const { stage } = await fixture('pf', 2025, 20254, 30323041, 100402014);
    if (stage.waveModel.kind !== 'spawn-sequence') throw new Error('expected spawn sequence');
    const wave = stage.waveModel.waves.find((item) => item.waveId === 303230413)!;
    expect(wave.pureFictionMechanic?.hpModifier).toEqual({
      status: 'resolved',
      source: 'wave-ability',
      ability: PURE_FICTION_WAVE_HP_ABILITY,
      hpAddedRatio: '39',
      totalRatio: '40',
      paramIndex: 1
    });
    expect(wave.pureFictionMechanic?.rounding).toEqual({
      ordinary: 'half-up',
      leader: 'truncate',
      leaderRanks: ['LittleBoss', 'BigBoss']
    });
    const enemies = wave.monsterGroups.flatMap((group) => group.orderedEnemies);
    expect(enemies.some((enemy) => enemy.monsterId === 100402014)).toBe(true);
    expect(enemies.every((enemy) => enemy.hp.final.status === 'resolved')).toBe(true);
  });

  it('PF 不同波次分别解析 multiplier，且 MaxHP 不依赖 kill-transfer 证明状态', async () => {
    const { stage } = await fixture('pf', 2025, 20254, 30323041, 5012010);
    if (stage.waveModel.kind !== 'spawn-sequence') throw new Error('expected spawn sequence');
    expect(
      stage.waveModel.waves.map((wave) => {
        const modifier = wave.pureFictionMechanic?.hpModifier;
        return modifier?.status === 'resolved' ? modifier.totalRatio : undefined;
      })
    ).toEqual(['5', '10', '40']);
    for (const wave of stage.waveModel.waves) {
      expect(wave.pureFictionMechanic?.killTransfer).toMatchObject({
        status: 'unconfirmed',
        reason: 'percentage-expression-unresolved',
        bindingKey: 'FantasticStory_BaseAbility_2310',
        sourceMazeBuffId: 3031231
      });
      expect(
        wave.monsterGroups
          .flatMap((group) => group.orderedEnemies)
          .every((enemy) => enemy.hp.final.status === 'resolved')
      ).toBe(true);
    }
  });

  it('多阶段和共享生命只作为机制元数据，不伪造总 HP', async () => {
    const { occurrence } = await fixture('as', 3019, 30194, 420484, 401401304);
    expect(occurrence.mechanics).toMatchObject({
      phaseCount: 2,
      sharedHp: true,
      restoresHp: true,
      effectiveTotalHpStatus: 'runtime-unclear'
    });
    expect(occurrence.mechanics.effectiveTotalHp).toBeUndefined();
  });

  it.each([
    [1, 420404, 406401204, '190.08', '360', '120', 8],
    [2, 420454, 100401404, '171.60', '300', '100', 1],
    [2, 420454, 100402604, '165.00', '600', '200', 1],
    [3, 420464, 403401304, '174.24', '900', '300', 2]
  ] as const)(
    '遗忘冽风难度 4 战斗 %s 的速度与韧性来自完整倍率链',
    async (_slot, stageId, monsterId, speed, internalStance, toughness, barCount) => {
      const { occurrence } = await fixture('as', 3018, 30184, stageId, monsterId);
      expect(occurrence.speed).toMatchObject({
        status: 'resolved',
        configuredValue: speed
      });
      expect(occurrence.toughness).toMatchObject({
        internalStance: { status: 'resolved', resolvedInternal: internalStance },
        display: { status: 'resolved', perBar: toughness },
        barCount,
        runtimeStatus: 'runtime-unclear'
      });
    }
  );

  it('缺失基础字段只生成明确的 unavailable 状态', async () => {
    const all = await Promise.all(modes.map(dataset));
    const allOccurrences = all.flatMap((data) =>
      data.groups
        .flatMap((group) => group.encounters)
        .flatMap((encounter) => encounter.battles)
        .flatMap((battle) => battle.stages)
        .flatMap(occurrences)
    );
    expect(
      new Set(
        allOccurrences
          .filter((item) => item.speed.status === 'unavailable')
          .map((item) => item.monsterTemplateId)
      ).size
    ).toBe(2);
    expect(
      new Set(
        allOccurrences
          .filter((item) => item.toughness.internalStance.status === 'unavailable')
          .map((item) => item.monsterTemplateId)
      ).size
    ).toBe(7);
  });

  it.each([
    [420474, 302401304, '810', '90', '900', '300'],
    [420484, 401401304, '1440', '0', '1440', '480'],
    [420494, 300402104, '390', '180', '570', '190']
  ] as const)(
    '兵锋骑士难度 4 的 MonsterID %s 使用玩家侧韧性单位',
    async (stageId, monsterId, base, add, internal, display) => {
      const { occurrence } = await fixture('as', 3019, 30194, stageId, monsterId);
      expect(occurrence.toughness.internalStance).toMatchObject({
        status: 'resolved',
        baseInternal: base,
        instanceRatio: '1',
        instanceValueInternal: add,
        hardLevelRatio: '1',
        eliteRatio: '1',
        resolvedInternal: internal
      });
      expect(occurrence.toughness.display).toEqual({ status: 'resolved', perBar: display });
    }
  );

  it('记录历史 MoC 的显式 MonsterConfig EliteGroup fallback', async () => {
    const latest = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as {
      endgameAudit: EndgameAudit;
    };
    expect(latest.endgameAudit.inferredMonsterEliteFallbacks).toBe(5272);
    expect(latest.endgameAudit.stanceConversion).toMatchObject({
      totalOccurrences: 25469,
      resolvedInternal: 25301,
      missingInternal: 168,
      resolvedDisplay: 25301,
      nonDivisibleByThree: 0,
      conversionUnavailable: 0,
      multiBarOccurrences: 40,
      nonPositiveDisplay: 0,
      minDisplayed: '10',
      maxDisplayed: '800',
      samples: []
    });
    expect(latest.endgameAudit.mazeBuffs).toEqual({
      distinctReferenced: 329,
      resolved: 329,
      displayReady: 322,
      missingLocalization: 7,
      missingIconPath: 0,
      missingDescriptionParams: 0,
      unusedParams: 78
    });
    expect(latest.endgameAudit.asBossGuides).toEqual({
      slotRelations: 163,
      applicableTraitRelations: 452,
      displayReadyTraits: 446,
      omittedTraitRelations: 6,
      guideStageMonsterMismatches: 12,
      missingMazeExtras: 0,
      missingSlotBindings: 0,
      missingGuides: 0,
      missingTags: 0,
      missingLocalization: 0,
      arrayLengthMismatches: 0,
      difficultyMismatches: 0,
      duplicateTags: 0,
      linkedEffectRelations: 181,
      displayReadyLinkedEffects: 181,
      omittedLinkedEffects: 0,
      distinctMalformedTags: 1,
      distinctUnusedParamTags: 22
    });
    expect(latest.endgameAudit.modifierRelations).toEqual({
      moc: { memoryTurbulence: 615, groupMismatches: 0 },
      pf: {
        groupBaseMechanics: 26,
        encounterBaseMechanics: 104,
        battleWillMechanics: 48,
        cacophonyGroups: 26,
        cacophonyOptions: 78
      },
      as: {
        aftertastes: 80,
        axiomSets: 43,
        axiomOptions: 129,
        stageBindingMismatches: 0
      },
      aa: {
        traits: 77,
        judgmentQuadrants: 9,
        quadrantOptions: 27,
        battleEventReferences: 45
      }
    });
  });

  it('索引层拒绝重复核心主键', () => {
    expect(() => buildUniqueIndex([{ id: 1 }, { id: 1 }], (row) => row.id, 'fixture')).toThrow(
      /重复键/
    );
  });
});
