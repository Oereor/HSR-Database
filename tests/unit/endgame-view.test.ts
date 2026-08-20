import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  EndgameMode,
  EndgameModeDataset,
  EnemyOccurrence
} from '../../src/lib/domain/endgame';
import {
  buildGroupView,
  buildOccurrenceView,
  buildPeriodView,
  endgameEnemyReferenceKey,
  formatExactDecimal,
  formatFullHp,
  formatHpWithPhases,
  formatRoundedDecimal,
  mergeFixedOccurrences,
  occurrenceIdentity,
  resolveEndgameEnemyReference,
  type EndgameEnemyDetailSource,
  uniqueSpawnOccurrences
} from '../../src/lib/domain/endgame-view';
import { ELEMENT_COLORS, getElementColor } from '../../src/lib/domain/elements';

const generatedRoot = path.resolve('src', 'lib', 'generated');
const decimal = (value: string) => value as DecimalString;

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
    expect(battle.stages[0].waves.map((wave) => wave.enemies.length)).toEqual([4, 3, 3]);
    expect(
      battle.stages[0].waves.flatMap((wave) => wave.enemies).every((enemy) => !enemy.count)
    ).toBe(true);
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
    expect(details.size).toBe(185);
  });
});

describe('Endgame 弱点视觉语义', () => {
  it('复用七种 canonical 属性颜色与 Thunder 规范化', () => {
    for (const [element, color] of Object.entries(ELEMENT_COLORS))
      expect(getElementColor(element)).toBe(color);
    expect(getElementColor('Thunder')).toBe(ELEMENT_COLORS.Lightning);
  });
});
