import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  EndgameGroup,
  EndgameMode,
  EndgameModeDataset,
  EnemyOccurrence
} from '../../src/lib/domain/endgame';
import {
  buildGroupView,
  buildOccurrenceView,
  buildPeriodView,
  ENDGAME_MODE_META,
  endgameEnemyReferenceKey,
  formatExactDecimal,
  formatFullHp,
  formatHpWithPhases,
  formatRatioPercentage,
  formatRoundedDecimal,
  groupEndgamePeriods,
  mergeFixedOccurrences,
  occurrenceIdentity,
  recommendedGroupId,
  resolveEndgameEnemyReference,
  type EndgameEnemyDetailSource,
  type EndgamePeriodView,
  uniqueSpawnOccurrences
} from '../../src/lib/domain/endgame-view';
import { ELEMENT_COLORS, getElementColor } from '../../src/lib/domain/elements';

const generatedRoot = path.resolve('src', 'lib', 'generated');
const decimal = (value: string) => value as DecimalString;

describe('Endgame 模式视觉 metadata', () => {
  it('集中维护四种模式的官方图标与主题色', () => {
    expect(
      Object.fromEntries(
        Object.entries(ENDGAME_MODE_META).map(([mode, metadata]) => [
          mode,
          [metadata.iconKey, metadata.accent]
        ])
      )
    ).toEqual({
      moc: ['AbyssThemeTabIcon', '#8157f0'],
      pf: ['ChallengeStory', '#4fa4e1'],
      as: ['ChallengeBoss', '#d068ed'],
      aa: ['StopFightingIcon', '#fb4554']
    });
  });
});

async function dataset(mode: EndgameMode): Promise<EndgameModeDataset> {
  return JSON.parse(
    await readFile(path.join(generatedRoot, 'endgame', `${mode}.json`), 'utf8')
  ) as EndgameModeDataset;
}

function occurrence(overrides: Partial<EnemyOccurrence> = {}): EnemyOccurrence {
  return {
    monsterId: 1,
    monsterTemplateId: 1,
    name: '测试敌人',
    hp: {
      hpBase: decimal('100'),
      instanceRatio: decimal('1'),
      levelRatio: decimal('1'),
      eliteRatio: decimal('1'),
      baseEncounterMaxHpPerBar: decimal('100'),
      final: {
        status: 'resolved',
        maxHpPerBar: decimal('100'),
        source: 'base-encounter',
        rounding: 'display-half-up'
      },
      eliteGroupId: 1,
      eliteGroupTable: 'elite',
      eliteContextSource: 'stage',
      eliteContextConfidence: 'verified'
    },
    speed: {
      status: 'resolved',
      base: decimal('100'),
      instanceRatio: decimal('1'),
      instanceValue: decimal('0'),
      levelRatio: decimal('1'),
      eliteRatio: decimal('1'),
      configuredValue: decimal('100')
    },
    toughness: {
      internalStance: {
        status: 'resolved',
        baseInternal: decimal('60'),
        instanceRatio: decimal('1'),
        instanceValueInternal: decimal('0'),
        hardLevelRatio: decimal('1'),
        eliteRatio: decimal('1'),
        resolvedInternal: decimal('60')
      },
      display: { status: 'resolved', perBar: decimal('20') },
      barCount: 1,
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
    },
    ...overrides
  };
}

function mocGroup(
  groupId: number,
  options: { name?: string; begin?: string; end?: string } = {}
): EndgameGroup {
  return {
    mode: 'moc',
    groupId,
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.begin && options.end
      ? { schedule: { begin: options.begin, end: options.end } }
      : {}),
    encounters: []
  };
}

describe('Endgame UI 生命值格式', () => {
  it.each([
    ['1444452.47100', '1,444,452'],
    ['11347628.66250', '11,347,629'],
    ['14628489.139950', '14,628,489'],
    ['63467351.45020015200', '63,467,351'],
    ['9999999999999999.9', '10,000,000,000,000,000']
  ])('%s 四舍五入为完整整数 %s', (source, expected) => {
    expect(formatFullHp(decimal(source))).toBe(expected);
  });

  it('多阶段只显示单条生命值乘阶段数', () => {
    const display = formatHpWithPhases(decimal('14628489.139950'), 2);
    expect(display).toBe('14,628,489 × 2');
    expect(display).not.toMatch(/[KMB]/);
    expect(display).not.toContain('总生命值');
  });

  it('拒绝非十进制字符串', () => {
    expect(() => formatFullHp('1e6' as DecimalString)).toThrow(/无效/);
  });

  it.each([
    ['190.08', '190'],
    ['171.6', '172'],
    ['165', '165'],
    ['174.24', '174']
  ])('速度 %s 四舍五入为整数 %s', (source, expected) => {
    expect(formatRoundedDecimal(decimal(source))).toBe(expected);
  });

  it.each([
    ['300', '300'],
    ['480.0', '480'],
    ['1234.50', '1,234.5']
  ])('玩家韧性 %s 保留精确值并格式化为 %s', (source, expected) => {
    expect(formatExactDecimal(decimal(source))).toBe(expected);
  });
});

describe('共享比例格式', () => {
  it.each([
    ['0.2', '20%'],
    ['0.25', '25%'],
    ['1', '100%']
  ])('将 ratio %s 格式化为 %s', (source, expected) => {
    expect(formatRatioPercentage(source)).toBe(expected);
  });
});

describe('Endgame 赛期回退与推荐', () => {
  const historical = mocGroup(1033, {
    name: '历史一期',
    begin: '2026-07-01 04:00:00',
    end: '2026-08-01 04:00:00'
  });

  it('保留未命名无时间组的展示回退，但推荐最新具名组', () => {
    const namedWithoutSchedule = mocGroup(1034, { name: '扫除风暴' });
    const unnamedWithoutSchedule = mocGroup(1035);

    expect(buildPeriodView(unnamedWithoutSchedule)).toMatchObject({
      name: '数据组 1035',
      dateLabel: '-',
      status: 'unknown'
    });
    expect(recommendedGroupId([historical, namedWithoutSchedule, unnamedWithoutSchedule])).toBe(
      1034
    );
  });

  it('全部无时间时仍选择 ID 最大的具名组', () => {
    expect(
      recommendedGroupId([
        mocGroup(1033, { name: '旧组' }),
        mocGroup(1034, { name: '新组' }),
        mocGroup(1035)
      ])
    ).toBe(1034);
  });

  it('只有未命名组时回退到 ID 最大的组', () => {
    expect(recommendedGroupId([mocGroup(1034), mocGroup(1035)])).toBe(1035);
  });

  it('最新具名组有时间时维持当前赛期优先', () => {
    const current = mocGroup(1034, {
      name: '当前一期',
      begin: '2026-08-01 04:00:00',
      end: '2026-09-01 04:00:00'
    });
    const upcoming = mocGroup(1035, {
      name: '未来一期',
      begin: '2026-09-01 04:00:00',
      end: '2026-10-01 04:00:00'
    });

    expect(
      recommendedGroupId([historical, current, upcoming], Date.parse('2026-08-20T00:00:00Z'))
    ).toBe(1034);
  });

  it('真实 4.5 MoC 保留 1034/1035 并默认推荐具名的 1034', async () => {
    const moc = await dataset('moc');
    const group1034 = moc.groups.find((group) => group.groupId === 1034)!;
    const group1035 = moc.groups.find((group) => group.groupId === 1035)!;

    expect(group1034).toMatchObject({ name: '扫除风暴' });
    expect(group1034.schedule).toBeUndefined();
    expect(group1034.encounters).toHaveLength(12);
    expect(group1035.name).toBeUndefined();
    expect(group1035.schedule).toBeUndefined();
    expect(group1035.encounters).toHaveLength(12);
    expect(buildPeriodView(group1035).name).toBe('数据组 1035');
    expect(recommendedGroupId(moc.groups)).toBe(1034);
  });
});

describe('Endgame archive 赛期分组', () => {
  it('保持 begin <= now < end 的既有边界规则', () => {
    const group = mocGroup(1036, {
      name: '边界测试',
      begin: '2026-08-31 04:00:00',
      end: '2026-09-14 04:00:00'
    });
    const begin = Date.parse('2026-08-30T20:00:00.000Z');
    const end = Date.parse('2026-09-13T20:00:00.000Z');

    expect(buildPeriodView(group, begin - 1).status).toBe('upcoming');
    expect(buildPeriodView(group, begin).status).toBe('current');
    expect(buildPeriodView(group, end - 1).status).toBe('current');
    expect(buildPeriodView(group, end).status).toBe('historical');
  });

  it('按既有状态稳定分组且不改变输入顺序', () => {
    const periods: EndgamePeriodView[] = [
      { groupId: 4, name: '未来', dateLabel: '未来日期', status: 'upcoming', encounterCount: 4 },
      {
        groupId: 3,
        name: '未知',
        dateLabel: '-',
        status: 'unknown',
        encounterCount: 4
      },
      { groupId: 2, name: '当前', dateLabel: '当前日期', status: 'current', encounterCount: 4 },
      { groupId: 1, name: '历史', dateLabel: '历史日期', status: 'historical', encounterCount: 4 }
    ];

    const groups = groupEndgamePeriods(periods);
    expect(groups.current.map(({ groupId }) => groupId)).toEqual([2]);
    expect(groups.upcoming.map(({ groupId }) => groupId)).toEqual([4]);
    expect(groups.unknown.map(({ groupId }) => groupId)).toEqual([3]);
    expect(groups.historical.map(({ groupId }) => groupId)).toEqual([1]);
  });

  it('真实 MoC 与 AA 无排期记录只进入 unknown', async () => {
    const now = Date.parse('2026-08-31T08:00:00.000Z');
    const moc = await dataset('moc');
    const aa = await dataset('aa');
    const mocGroups = groupEndgamePeriods(moc.groups.map((group) => buildPeriodView(group, now)));
    const aaGroups = groupEndgamePeriods(aa.groups.map((group) => buildPeriodView(group, now)));

    expect(mocGroups.unknown.map(({ groupId }) => groupId)).toEqual([100, 900, 1034, 1035]);
    expect(mocGroups.upcoming.map(({ groupId }) => groupId)).toEqual([108, 109]);
    expect(mocGroups.historical).toHaveLength(50);
    expect(aaGroups.unknown).toHaveLength(9);
    expect(aaGroups.current).toHaveLength(0);
    expect(aaGroups.upcoming).toHaveLength(0);
    expect(aaGroups.historical).toHaveLength(0);
  });
});

describe('Endgame occurrence 投影', () => {
  it('按具体 MonsterID 解析弱点，且同模板实例使用独立引用键', () => {
    const detail: EndgameEnemyDetailSource = {
      name: '测试模板',
      rank: 'Minion',
      monsters: [
        { monsterId: '10', weaknesses: [{ element: 'Physical', name: '物理' }] },
        { monsterId: '101', weaknesses: [{ element: 'Quantum', name: '量子' }] }
      ]
    };
    expect(resolveEndgameEnemyReference(detail, 101).weaknesses).toEqual([
      { element: 'Quantum', name: '量子' }
    ]);
    expect(endgameEnemyReferenceKey(10, 10)).not.toBe(endgameEnemyReferenceKey(101, 10));
  });

  it('canonical MonsterID 仍按其自身记录正常解析', () => {
    const detail: EndgameEnemyDetailSource = {
      monsters: [{ monsterId: '10', weaknesses: [{ element: 'Fire', name: '火' }] }]
    };
    expect(resolveEndgameEnemyReference(detail, 10)).toMatchObject({
      weaknesses: [{ element: 'Fire', name: '火' }],
      exists: true
    });
  });

  it('具体 MonsterID 无效时显式失败，不回退到 canonical Monster', () => {
    const detail: EndgameEnemyDetailSource = {
      monsters: [{ monsterId: '10', weaknesses: [{ element: 'Fire', name: '火' }] }]
    };
    expect(() => resolveEndgameEnemyReference(detail, 101)).toThrow(/MonsterID：101/);
  });

  it('固定阵容只合并完整 identity 相同的实例', () => {
    const first = occurrence();
    const scaled = occurrence({
      hp: {
        ...first.hp,
        instanceRatio: decimal('2'),
        baseEncounterMaxHpPerBar: decimal('200'),
        final: {
          status: 'resolved',
          maxHpPerBar: decimal('200'),
          source: 'base-encounter',
          rounding: 'display-half-up'
        }
      }
    });
    expect(mergeFixedOccurrences([first, first, scaled])).toEqual([
      { occurrence: first, count: 2 },
      { occurrence: scaled, count: 1 }
    ]);
    expect(occurrenceIdentity(first)).not.toBe(occurrenceIdentity(scaled));
  });

  it('PF 折叠重复实例但保留同模板的不同 MonsterID', () => {
    const first = occurrence({ monsterId: 4032024, monsterTemplateId: 4032024 });
    const variant = occurrence({ monsterId: 403202401, monsterTemplateId: 4032024 });
    expect(uniqueSpawnOccurrences([first, first, variant])).toEqual([first, variant]);
  });

  it('未解析的 PF 最终 HP 使用资料未提供约定', () => {
    const unresolved = occurrence({
      hp: {
        ...occurrence().hp,
        final: { status: 'unresolved', reason: 'unsupported-pf-wave-ability' }
      }
    });
    expect(buildOccurrenceView(unresolved).hp).toEqual({ roundedPerBar: '资料未提供' });
  });

  it('真实 PF 波次只保留唯一类型且不产生数量字段', async () => {
    const pf = await dataset('pf');
    const group = pf.groups.find((candidate) => candidate.groupId === 2025)!;
    const view = buildGroupView(group, [buildPeriodView(group)], new Map());
    const battle = view.encounters.find((candidate) => candidate.id === '20254')!.battles[0];
    expect(battle.stages[0].waves.map((wave) => wave.label)).toEqual([
      '波次 1',
      '波次 2',
      '波次 3'
    ]);
    expect(battle.stages[0].waves.map((wave) => wave.enemies.length)).toEqual([4, 3, 3]);
    expect(
      battle.stages[0].waves.flatMap((wave) => wave.enemies).every((enemy) => !enemy.count)
    ).toBe(true);
  });

  it('真实 MoC 保留普通双波次与历史高密度三波次结构', async () => {
    const moc = await dataset('moc');
    const currentGroup = moc.groups.find((candidate) => candidate.groupId === 1034)!;
    const currentView = buildGroupView(currentGroup, [buildPeriodView(currentGroup)], new Map());
    const current = currentView.encounters.find((candidate) => candidate.id === '5312')!;
    expect(current.battles[0].stages[0].waves.map((wave) => wave.enemies.length)).toEqual([2, 1]);

    const legacyGroup = moc.groups.find((candidate) => candidate.groupId === 101)!;
    const legacyView = buildGroupView(legacyGroup, [buildPeriodView(legacyGroup)], new Map());
    const legacy = legacyView.encounters.find((candidate) => candidate.id === '108')!;
    const highDensityStage = legacy.battles
      .flatMap((battle) => battle.stages)
      .find(
        (stage) => stage.waves.length === 3 && stage.waves.some((wave) => wave.enemies.length >= 3)
      );
    expect(highDensityStage?.waves.map((wave) => wave.enemies.length)).toEqual([4, 4, 1]);
  });

  it('真实 AA 保留 Group 6 三波次与 Group 8 双波次结构', async () => {
    const aa = await dataset('aa');
    const group6 = aa.groups.find((candidate) => candidate.groupId === 6)!;
    const group6View = buildGroupView(group6, [buildPeriodView(group6)], new Map());
    const group6Normal = group6View.encounters.find((candidate) => candidate.id === '604:normal')!;
    expect(group6Normal.battles[0].stages[0].waves.map((wave) => wave.enemies.length)).toEqual([
      2, 1, 1
    ]);

    const group8 = aa.groups.find((candidate) => candidate.groupId === 8)!;
    const group8View = buildGroupView(group8, [buildPeriodView(group8)], new Map());
    for (const encounterId of ['804:normal', '804:hard']) {
      const encounter = group8View.encounters.find((candidate) => candidate.id === encounterId)!;
      expect(encounter.battles[0].stages[0].waves.map((wave) => wave.enemies.length)).toEqual([
        2, 2
      ]);
    }
  });

  it('真实 AA 骑士关的 battle 仅是单 battle、单 stage 的展示 wrapper', async () => {
    const aa = await dataset('aa');
    let knightCount = 0;

    for (const group of aa.groups) {
      const view = buildGroupView(group, [buildPeriodView(group)], new Map());
      for (const knight of view.encounters.filter(
        (encounter) => encounter.variant === 'preliminary'
      )) {
        knightCount += 1;
        expect(knight.battles).toHaveLength(1);
        expect(knight.battles[0].stages).toHaveLength(1);
        expect(knight.battles[0].stages[0].waves.length).toBeGreaterThanOrEqual(1);
        expect(knight.battles[0].stages[0].waves.length).toBeLessThanOrEqual(2);
      }
    }

    expect(knightCount).toBe(27);
  });

  it('真实 AA 只展示实际 spawned MonsterID', async () => {
    const aa = await dataset('aa');
    const group = aa.groups.find((candidate) => candidate.groupId === 8)!;
    const view = buildGroupView(group, [buildPeriodView(group)], new Map());
    const hard = view.encounters.find((candidate) => candidate.id === '804:hard')!;
    const ids = hard.battles.flatMap((battle) =>
      battle.stages.flatMap((stage) =>
        stage.waves.flatMap((wave) => wave.enemies.map((enemy) => enemy.monsterId))
      )
    );
    expect(ids).toContain(501403002);
    expect(ids).not.toContain(5014030);
  });

  it('真实 PF 非 canonical 个体展示自身弱点与既有具体属性', async () => {
    const pf = await dataset('pf');
    const group = pf.groups.find((candidate) => candidate.groupId === 2001)!;
    const detail = JSON.parse(
      await readFile(path.join(generatedRoot, 'details', 'enemies', '8002050.json'), 'utf8')
    ) as EndgameEnemyDetailSource;
    const canonical = resolveEndgameEnemyReference(detail, 8002050);
    const concrete = resolveEndgameEnemyReference(detail, 800205005);
    expect(canonical.weaknesses.map(({ element }) => element)).toEqual([
      'Physical',
      'Quantum',
      'Imaginary'
    ]);
    expect(concrete.weaknesses.map(({ element }) => element)).toEqual(['Lightning', 'Imaginary']);

    const view = buildGroupView(
      group,
      [buildPeriodView(group)],
      new Map([[endgameEnemyReferenceKey(800205005, 8002050), concrete]])
    );
    const enemy = view.encounters
      .flatMap((encounter) => encounter.battles)
      .flatMap((battle) => battle.stages)
      .flatMap((stage) => stage.waves)
      .flatMap((wave) => wave.enemies)
      .find((candidate) => candidate.monsterId === 800205005)!;
    expect(enemy.weaknesses.map(({ element }) => element)).toEqual(['Lightning', 'Imaginary']);
    expect(enemy.speed.exact).toBe('120');
    expect(enemy.toughness.exactPerBar).toBe('30');
  });

  it('所有 Endgame 具体 MonsterID 均存在对应百科个体记录', async () => {
    const references = new Map<string, { monsterId: number; monsterTemplateId: number }>();
    for (const mode of ['moc', 'pf', 'as', 'aa'] as EndgameMode[]) {
      const data = await dataset(mode);
      for (const group of data.groups)
        for (const encounter of group.encounters)
          for (const battle of encounter.battles)
            for (const stage of battle.stages) {
              const occurrences =
                stage.waveModel.kind === 'fixed'
                  ? stage.waveModel.waves.flatMap((wave) => wave.enemies)
                  : stage.waveModel.waves.flatMap((wave) =>
                      wave.monsterGroups.flatMap((monsterGroup) => monsterGroup.orderedEnemies)
                    );
              for (const enemy of occurrences)
                references.set(
                  endgameEnemyReferenceKey(enemy.monsterId, enemy.monsterTemplateId),
                  enemy
                );
            }
    }
    expect(references.size).toBeGreaterThan(185);
    const details = new Map<number, EndgameEnemyDetailSource>();
    for (const { monsterId, monsterTemplateId } of references.values()) {
      let detail = details.get(monsterTemplateId);
      if (!detail) {
        detail = JSON.parse(
          await readFile(
            path.join(generatedRoot, 'details', 'enemies', `${monsterTemplateId}.json`),
            'utf8'
          )
        ) as EndgameEnemyDetailSource;
        details.set(monsterTemplateId, detail);
      }
      expect(resolveEndgameEnemyReference(detail, monsterId).weaknesses).toBeInstanceOf(Array);
    }
    expect(details.size).toBe(190);
  }, 15_000);
});

describe('Endgame 弱点视觉语义', () => {
  it('复用七种 canonical 属性颜色与 Thunder 规范化', () => {
    for (const [element, color] of Object.entries(ELEMENT_COLORS))
      expect(getElementColor(element)).toBe(color);
    expect(getElementColor('Thunder')).toBe(ELEMENT_COLORS.Lightning);
  });
});

describe('Endgame mechanics 视图投影', () => {
  it('MoC 仅汇总所有 encounter 完全一致的记忆紊流', async () => {
    const moc = await dataset('moc');
    const current = moc.groups.find((group) => group.groupId === 1034)!;
    const currentView = buildGroupView(current, [buildPeriodView(current)], new Map());
    if (currentView.mode !== 'moc') throw new Error('MoC view mode 不匹配');
    expect(currentView.memoryTurbulence).toMatchObject({
      id: 3030147,
      name: '记忆紊流'
    });
    expect(currentView.encounters.every((encounter) => !encounter.memoryTurbulence)).toBe(true);

    const legacy = moc.groups.find((group) => group.groupId === 900)!;
    const legacyView = buildGroupView(legacy, [buildPeriodView(legacy)], new Map());
    if (legacyView.mode !== 'moc') throw new Error('MoC view mode 不匹配');
    expect(legacyView.memoryTurbulence).toBeUndefined();
    expect(
      legacyView.encounters.slice(0, 2).map((encounter) => encounter.memoryTurbulence?.id)
    ).toEqual([3030036, 3030032]);
  });

  it('PF 分离 display-ready 战意机制与荒腔走板', async () => {
    const pf = await dataset('pf');
    const current = pf.groups.find((group) => group.groupId === 2025)!;
    const currentView = buildGroupView(current, [buildPeriodView(current)], new Map());
    if (currentView.mode !== 'pf') throw new Error('PF view mode 不匹配');
    expect(currentView.fixedMechanics.map((mechanic) => mechanic.id)).toEqual([
      3031232, 3031233, 3031234
    ]);
    expect(currentView.cacophony?.options.map((option) => option.id)).toEqual([
      3031363, 3031364, 3031365
    ]);
    expect(currentView.encounters.every((encounter) => !encounter.baseMechanic)).toBe(true);

    const legacy = pf.groups.find((group) => group.groupId === 2001)!;
    const legacyView = buildGroupView(legacy, [buildPeriodView(legacy)], new Map());
    if (legacyView.mode !== 'pf') throw new Error('PF view mode 不匹配');
    expect(legacyView.fixedMechanics.map((mechanic) => mechanic.id)).toEqual([3031001]);
    expect(legacyView.encounters.every((encounter) => !encounter.baseMechanic)).toBe(true);
  });

  it('AS 把实际敌人、终焉公理和首领特性分别投影到真实 battle slot', async () => {
    const shadow = await dataset('as');
    const current = shadow.groups.find((group) => group.groupId === 3020)!;
    const currentView = buildGroupView(current, [buildPeriodView(current)], new Map());
    if (currentView.mode !== 'as') throw new Error('AS view mode 不匹配');
    const encounter = currentView.encounters.find((candidate) => candidate.id === '30204')!;
    expect(encounter.aftertaste?.id).toBe(3110018);
    expect(encounter.battles.map((battle) => battle.axiomSet?.options.length)).toEqual([3, 3, 3]);
    expect(encounter.battles.map((battle) => battle.axiomSet?.key)).toEqual([
      'as:3020:BuffList1',
      'as:3020:BuffList2',
      'as:3020:BuffList3'
    ]);
    expect(encounter.battles.map((battle) => battle.bossGuide?.traits.length)).toEqual([4, 4, 4]);
    expect(encounter.battles[0]?.bossGuide?.traits.map(({ name }) => name)).toEqual([
      '坚防守备',
      '丰亨豫大',
      '如鹿添翼',
      '仙光夺目'
    ]);
    expect(
      encounter.battles[2]?.bossGuide?.traits
        .find((trait) => trait.id === 101602)
        ?.linkedEffects.map((effect) => effect.id)
    ).toEqual(['501401001', '70000318']);
    expect(
      encounter.battles.map((battle) => battle.stages[0]?.waves[0]?.enemies[0]?.monsterId)
    ).toEqual([202401604, 203501204, 501401404]);
    expect(encounter.battles.every((battle) => !('bossProfile' in battle))).toBe(true);

    const twoSlots = shadow.groups.find((group) => group.groupId === 3001)!;
    const twoSlotView = buildGroupView(twoSlots, [buildPeriodView(twoSlots)], new Map());
    if (twoSlotView.mode !== 'as') throw new Error('AS view mode 不匹配');
    expect(twoSlotView.encounters.at(-1)?.battles.map((battle) => battle.slot)).toEqual([1, 2]);
    expect(twoSlotView.encounters.at(-1)?.battles.every((battle) => !!battle.axiomSet)).toBe(true);
    const companionEnemies = twoSlotView.encounters
      .find((candidate) => candidate.id === '30014')
      ?.battles.find((battle) => battle.slot === 1)?.stages[0]?.waves[0]?.enemies;
    expect(companionEnemies?.map(({ monsterId }) => monsterId)).toEqual([100401404, 100402604]);
    expect(companionEnemies?.map(({ name }) => name)).toEqual(['无望冽风的幻灭者', '杰帕德']);
    expect(companionEnemies?.[1]?.hp.roundedPerBar).toBeTruthy();

    const mismatch = shadow.groups.find((group) => group.groupId === 3011)!;
    const mismatchView = buildGroupView(mismatch, [buildPeriodView(mismatch)], new Map());
    if (mismatchView.mode !== 'as') throw new Error('AS view mode 不匹配');
    const mismatchSlot = mismatchView.encounters
      .find((candidate) => candidate.id === '30114')
      ?.battles.find((battle) => battle.slot === 2);
    expect(mismatchSlot?.stages[0]?.waves[0]?.enemies[0]?.monsterId).toBe(203501204);
    expect('bossProfile' in (mismatchSlot ?? {})).toBe(false);
    expect(mismatchSlot?.bossGuide?.traits).toHaveLength(4);
    expect(JSON.stringify(mismatchSlot)).not.toContain('203302204');

    const malformed = shadow.groups.find((group) => group.groupId === 3003)!;
    const malformedView = buildGroupView(malformed, [buildPeriodView(malformed)], new Map());
    if (malformedView.mode !== 'as') throw new Error('AS view mode 不匹配');
    const malformedTraits = malformedView.encounters
      .find((candidate) => candidate.id === '30034')
      ?.battles.find((battle) => battle.slot === 2)?.bossGuide?.traits;
    expect(malformedTraits?.map(({ id }) => id)).toEqual([100601, 100602, 100604]);
  });

  it('AA 保持 normal/hard traits 独立并共享 boss-owned 裁决象限', async () => {
    const arbitration = await dataset('aa');
    const group = arbitration.groups.find((candidate) => candidate.groupId === 8)!;
    const view = buildGroupView(group, [buildPeriodView(group)], new Map());
    if (view.mode !== 'aa') throw new Error('AA view mode 不匹配');
    expect(view.judgmentQuadrant?.options.map((option) => option.id)).toEqual([
      3033066, 3033068, 3033067
    ]);
    const normal = view.encounters.find((encounter) => encounter.id === '804:normal')!;
    const hard = view.encounters.find((encounter) => encounter.id === '804:hard')!;
    const preliminary = view.encounters.find((encounter) => encounter.id === '801:preliminary')!;
    expect(normal.traits.map((trait) => trait.id)).toEqual([3033069, 3033051]);
    expect(hard.traits.map((trait) => trait.id)).toEqual([3033070, 3033052]);
    expect(normal.judgmentQuadrantKey).toBe(view.judgmentQuadrant?.key);
    expect(hard.judgmentQuadrantKey).toBe(view.judgmentQuadrant?.key);
    expect(preliminary.judgmentQuadrantKey).toBeUndefined();
    expect('battleRule' in normal).toBe(false);
    expect('battleRule' in hard).toBe(false);
  });

  it('AA 王棋全部复用单 battle/stage 数据骨架并保留真实波次形态', async () => {
    const arbitration = await dataset('aa');
    const kingEncounters = arbitration.groups.flatMap((group) => {
      const view = buildGroupView(group, [buildPeriodView(group)], new Map());
      if (view.mode !== 'aa') throw new Error('AA view mode 不匹配');
      return view.encounters
        .filter(
          (encounter) => encounter.variant === 'boss-normal' || encounter.variant === 'boss-hard'
        )
        .map((encounter) => ({ groupId: group.groupId, encounter }));
    });

    expect(kingEncounters).toHaveLength(18);
    expect(
      kingEncounters.every(
        ({ encounter }) =>
          encounter.battles.length === 1 && encounter.battles[0]?.stages.length === 1
      )
    ).toBe(true);
    expect(
      kingEncounters.every(({ encounter }) => {
        const level = encounter.battles[0]?.stages[0]?.level;
        return level === (encounter.variant === 'boss-hard' ? 120 : 100);
      })
    ).toBe(true);
    expect(
      kingEncounters
        .filter(({ encounter }) => encounter.battles[0]?.stages[0]?.waves.length === 1)
        .map(({ groupId }) => groupId)
    ).toEqual([2, 2, 3, 3, 9, 9]);
    expect(
      kingEncounters
        .filter(({ encounter }) => encounter.battles[0]?.stages[0]?.waves[0]?.enemies.length === 1)
        .map(({ groupId }) => groupId)
    ).toEqual([2, 2, 3, 3, 9, 9]);
  });
});
