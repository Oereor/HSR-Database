import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  EndgameMode,
  EndgameModeDataset,
  EndgameStage,
  EnemyOccurrence
} from '../../src/lib/domain/endgame';
import { buildUniqueIndex, type EndgameAudit } from '../../scripts/data/endgame';
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

async function dataset(mode: EndgameMode): Promise<EndgameModeDataset> {
  return JSON.parse(
    await readFile(path.join(generatedRoot, 'endgame', `${mode}.json`), 'utf8')
  ) as EndgameModeDataset;
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

describe('Endgame 真实数据管线', () => {
  it('四个模式使用 schema 16 且 fixed/spawn 模型分离', async () => {
    const all = await Promise.all(modes.map(dataset));
    expect(all.every((item) => item.schemaVersion === 16)).toBe(true);
    expect((await fixture('moc', 1034, 5312, 30124121, 3024020)).stage.waveModel.kind).toBe(
      'fixed'
    );
    expect((await fixture('pf', 2025, 20254, 30323041, 100402014)).stage.waveModel.kind).toBe(
      'spawn-sequence'
    );
    expect((await fixture('as', 3020, 30204, 420484, 401401304)).stage.waveModel.kind).toBe(
      'fixed'
    );
    expect((await fixture('aa', 8, 804, 30508022, 501403002)).stage.waveModel.kind).toBe(
      'spawn-sequence'
    );
  });

  it.each([
    ['moc', 1034, 5312, 30124121, 3024020, ['4650', '1', '375.4385', '6.5'], '11347628.66250'],
    ['pf', 2025, 20254, 30323041, 100402014, ['1023', '7.5', '188.2636', '1'], '1444452.47100'],
    ['as', 3020, 30204, 420484, 401401304, ['32550', '1', '236.53471', '1.9'], '14628489.139950'],
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
    const { stage, occurrence } = await fixture('aa', 8, 804, 30508022, 501403002);
    expect(occurrence.monsterTemplateId).toBe(5014030);
    expect(stage.previewMonsterIds).toContain(5014030);
    expect(occurrences(stage).some((item) => item.monsterId === 5014030)).toBe(false);
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
        reason: 'ability-body-missing'
      });
      expect(
        wave.monsterGroups
          .flatMap((group) => group.orderedEnemies)
          .every((enemy) => enemy.hp.final.status === 'resolved')
      ).toBe(true);
    }
  });

  it('多阶段和共享生命只作为机制元数据，不伪造总 HP', async () => {
    const { occurrence } = await fixture('as', 3020, 30204, 420484, 401401304);
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
      totalOccurrences: 24374,
      resolvedInternal: 24215,
      missingInternal: 159,
      resolvedDisplay: 24215,
      nonDivisibleByThree: 0,
      conversionUnavailable: 0,
      multiBarOccurrences: 36,
      nonPositiveDisplay: 0,
      minDisplayed: '10',
      maxDisplayed: '800',
      samples: []
    });
  });

  it('索引层拒绝重复核心主键', () => {
    expect(() => buildUniqueIndex([{ id: 1 }, { id: 1 }], (row) => row.id, 'fixture')).toThrow(
      /重复键/
    );
  });
});
