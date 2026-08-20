import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../../src/lib/domain/types';
import { formatRoundedDecimal } from '../../src/lib/domain/endgame-view';
import { buildEnemyDetailView, enemySkillAnchorId } from '../../src/lib/domain/enemy-view';
import {
  buildEnemySkillPhases,
  normalizeEnemyPhases,
  normalizeEnemySkillKind,
  normalizeEnemySkillTag,
  normalizeSpecialResistances,
  resolveCanonicalEnemyStats
} from '../../scripts/data/enemy-detail';
import { generatedRoot, auditRoot } from '../../scripts/data/paths';

const wrapped = (value: string) => ({ Value: value });
const enemy = async (id: string): Promise<Enemy> =>
  JSON.parse(
    await readFile(path.join(generatedRoot, 'details', 'enemies', `${id}.json`), 'utf8')
  ) as Enemy;

describe('Enemy Detail parser/resolver', () => {
  it('无损生成七项等级属性并对缺失基础字段降级', () => {
    const stats = resolveCanonicalEnemyStats(
      {
        HPBase: wrapped('10'),
        AttackBase: wrapped('20'),
        DefenceBase: wrapped('30'),
        StanceBase: wrapped('90'),
        StatusResistanceBase: wrapped('0.2')
      },
      {
        HPModifyRatio: wrapped('2'),
        AttackModifyRatio: wrapped('1'),
        DefenceModifyRatio: wrapped('1'),
        StanceModifyRatio: wrapped('1')
      },
      [
        {
          Level: 1,
          HPRatio: wrapped('3'),
          AttackRatio: wrapped('2'),
          DefenceRatio: wrapped('1'),
          SpeedRatio: wrapped('1'),
          StanceRatio: wrapped('2'),
          StatusProbability: wrapped('0.36'),
          StatusResistance: wrapped('0.1')
        }
      ],
      {
        HPRatio: wrapped('1'),
        AttackRatio: wrapped('1'),
        DefenceRatio: wrapped('1'),
        SpeedRatio: wrapped('1'),
        StanceRatio: wrapped('1')
      }
    );
    const row = stats.levels[0];
    expect(row.hp).toEqual({ status: 'resolved', value: '60' });
    expect(row.attack).toEqual({ status: 'resolved', value: '40' });
    expect(row.defence).toEqual({ status: 'resolved', value: '30' });
    expect(row.speed).toEqual({ status: 'unavailable', reason: 'missing-base' });
    expect(row.toughness).toEqual({ status: 'resolved', value: '60' });
    expect(row.effectHit).toEqual({ status: 'resolved', value: '0.36' });
    expect(row.effectResistance).toEqual({ status: 'resolved', value: '0.3' });
  });

  it('稳定映射 kind/tag/phase 与七种特殊状态抗性，并诊断未知值', () => {
    expect(normalizeEnemySkillKind('技能')).toBe('skill');
    expect(normalizeEnemySkillKind('天赋')).toBe('talent');
    expect(normalizeEnemySkillKind('未来类型')).toBe('unknown');
    expect(normalizeEnemySkillTag('弹射')).toEqual({ code: 'Bounce', label: '弹射', known: true });
    expect(normalizeEnemySkillTag('未来标签')).toEqual({
      code: '未来标签',
      label: '未来标签',
      known: false
    });
    expect(normalizeEnemyPhases([2, 1, 2, 0, -1, 'bad'])).toEqual([1, 2]);
    const normalized = normalizeSpecialResistances([
      { Key: 'STAT_CTRL', Value: wrapped('0.5') },
      { Key: 'STAT_CTRL_Frozen', Value: wrapped('0.4') },
      { Key: 'STAT_Confine', Value: wrapped('0.3') },
      { Key: 'STAT_Entangle', Value: wrapped('0.2') },
      { Key: 'STAT_DOT_Burn', Value: wrapped('0.1') },
      { Key: 'STAT_DOT_Electric', Value: wrapped('0.1') },
      { Key: 'STAT_DOT_Poison', Value: wrapped('0.1') },
      { Key: 'STAT_FUTURE', Value: wrapped('1') }
    ]);
    expect(normalized.values.map((value) => value.label)).toEqual([
      '控制抵抗',
      '冻结抵抗',
      '禁锢抵抗',
      '纠缠抵抗',
      '灼烧抵抗',
      '触电抵抗',
      '风化抵抗'
    ]);
    expect(normalized.unknownKeys).toEqual(['STAT_FUTURE']);
  });

  it('规范化真实阶段、共享技能、过滤后空阶段与原始技能顺序', () => {
    expect(
      buildEnemySkillPhases([
        { id: 'shared', phases: [], visible: true },
        { id: 'later', phases: [3, 2, 3, 0], visible: true },
        { id: 'filtered', phases: [2], visible: false },
        { id: 'last', phases: [3], visible: true }
      ])
    ).toEqual([
      { index: 2, skillIds: ['shared', 'later'] },
      { index: 3, skillIds: ['shared', 'later', 'last'] }
    ]);
    expect(
      buildEnemySkillPhases([
        { id: 'only-filtered', phases: [1], visible: false },
        { id: 'visible-later', phases: [2], visible: true }
      ])
    ).toEqual([
      { index: 1, skillIds: [] },
      { index: 2, skillIds: ['visible-later'] }
    ]);
    expect(buildEnemySkillPhases([{ id: 'single', phases: [], visible: true }])).toEqual([
      { index: 1, skillIds: ['single'] }
    ]);
  });
});

describe('Enemy Detail 真实数据回归', () => {
  it('显式表达 Template → Monster 关系，并保留 concrete ownership', async () => {
    const detail = await enemy('1002015');
    expect(detail.template.monsterTemplateId).toBe('1002015');
    expect(detail.defaultMonsterId).toBe('1002015');
    expect(detail.monsters).toHaveLength(11);
    expect(detail.monsters.filter((monster) => monster.monsterId === '1002015')).toHaveLength(1);
    expect(detail.monsters.every((monster) => monster.monsterTemplateId === '1002015')).toBe(true);

    const canonical = detail.monsters.find((monster) => monster.monsterId === '1002015')!;
    const quantumVariant = detail.monsters.find((monster) => monster.monsterId === '100201506')!;
    expect(canonical.weaknesses.map((item) => item.element)).toEqual(['Fire', 'Lightning']);
    expect(quantumVariant.weaknesses.map((item) => item.element)).toEqual(['Fire', 'Quantum']);
    expect(quantumVariant.stats.levels[94].hp).not.toEqual(canonical.stats.levels[94].hp);
    expect(canonical.modifiers.hp.ratio).toBe('1');
    expect(quantumVariant.modifiers.hp.ratio).toBe('4');
    expect(quantumVariant.modifiers.attack.ratio).toBe('0.33333302');
    expect(quantumVariant.skills).toHaveLength(2);
    expect(detail.weaknesses).toEqual(canonical.weaknesses);
    expect(detail.defaultMonster.skills).toEqual(canonical.skills);
  });

  it('所有生成 Template 均以显式关系连接 concrete Monster，ID 编码仅作 validation', async () => {
    const files = (await readdir(path.join(generatedRoot, 'details', 'enemies'))).filter((file) =>
      file.endsWith('.json')
    );
    for (const file of files) {
      const detail = JSON.parse(
        await readFile(path.join(generatedRoot, 'details', 'enemies', file), 'utf8')
      ) as Enemy;
      expect(detail.template.monsterTemplateId).toBe(detail.id);
      expect(detail.monsters.length).toBeGreaterThan(0);
      expect(detail.monsters.every((monster) => monster.monsterTemplateId === detail.id)).toBe(
        true
      );
      expect(detail.monsters.some((monster) => monster.monsterId === detail.id)).toBe(true);
      expect(detail.monsters.every((monster) => [7, 9].includes(monster.monsterId.length))).toBe(
        true
      );
    }
  });

  it('8034010 包含 Lv.95 七项属性、弱点抗性、召唤与多阶段技能', async () => {
    const aventurine = await enemy('8034010');
    const monster = aventurine.defaultMonster;
    const row = monster.stats.levels.find((candidate) => candidate.level === 95)!;
    expect(
      [row.hp, row.attack, row.defence, row.speed, row.toughness].map((value) =>
        value.status === 'resolved' ? formatRoundedDecimal(value.value) : 'unavailable'
      )
    ).toEqual(['657,149', '718', '1,150', '158', '150']);
    expect(row.effectHit).toEqual({ status: 'resolved', value: '0.36' });
    expect(row.effectResistance).toEqual({ status: 'resolved', value: '0.4' });
    expect(monster.weaknesses.map((item) => item.element)).toEqual([
      'Physical',
      'Ice',
      'Lightning'
    ]);
    expect(monster.resistances.map((item) => [item.element, item.value])).toEqual([
      ['Wind', 0.2],
      ['Quantum', 0.2],
      ['Imaginary', 0.4]
    ]);
    expect(monster.specialResistances).toContainEqual({
      code: 'STAT_CTRL',
      label: '控制类',
      value: '0.5'
    });
    expect(monster.summons).toEqual([
      expect.objectContaining({ monsterId: '8032030', monsterTemplateId: '8032030' })
    ]);
    expect(monster.skills.find((skill) => skill.id === '803401002')).toMatchObject({
      name: '分散投资',
      kind: 'skill',
      tag: { code: 'Bounce', label: '弹射', known: true },
      damageType: { element: 'Imaginary', name: '虚数' },
      phases: [1, 2]
    });
    expect(monster.skillPhases).toHaveLength(2);
    expect(monster.skillPhases.every((phase) => phase.skillIds.includes('803401002'))).toBe(true);
  });

  it('按原始 PhaseList 生成单阶段、两阶段、三阶段与特殊 2/3 阶段', async () => {
    expect((await enemy('3002011')).defaultMonster.skillPhases.map((phase) => phase.index)).toEqual(
      [1]
    );

    const twoPhase = (await enemy('1005010')).defaultMonster;
    expect(twoPhase.skillPhases.map((phase) => phase.index)).toEqual([1, 2]);
    expect(twoPhase.skillPhases[0].skillIds).toContain('100501001');
    expect(twoPhase.skillPhases[0].skillIds).not.toContain('100501005');
    expect(twoPhase.skillPhases[1].skillIds).toContain('100501005');
    expect(twoPhase.skillPhases.every((phase) => phase.skillIds.includes('100501003'))).toBe(true);

    const threePhase = (await enemy('1004011')).defaultMonster;
    expect(threePhase.skillPhases.map((phase) => phase.index)).toEqual([1, 2, 3]);
    expect(threePhase.skillPhases.every((phase) => phase.skillIds.includes('100401101'))).toBe(
      true
    );
    expect(
      threePhase.skillPhases.slice(1).every((phase) => phase.skillIds.includes('100401103'))
    ).toBe(true);

    expect((await enemy('4014022')).defaultMonster.skillPhases.map((phase) => phase.index)).toEqual(
      [2, 3]
    );
  });

  it('技能仅发布安全字段，并保持 ExtraEffect 与缺失 DamageType 的边界', async () => {
    const extra = (await enemy('1004014')).defaultMonster.skills.find(
      (skill) => skill.id === '100401411'
    )!;
    expect(extra.extraEffects).toContainEqual(
      expect.objectContaining({ id: '70000304', name: '转移' })
    );
    expect(
      (await enemy('1004014')).defaultMonster.skills.some((skill) => skill.id === '100401414')
    ).toBe(false);
    const missingDamage = (await enemy('4034013')).defaultMonster.skills.find(
      (skill) => skill.id === '403401302'
    )!;
    expect(missingDamage).not.toHaveProperty('damageType');
    for (const [enemyId, skillId] of [
      ['3002011', '300201102'],
      ['1004010', '100401005']
    ]) {
      const skill = (await enemy(enemyId)).defaultMonster.skills.find(
        (candidate) => candidate.id === skillId
      )!;
      expect(skill.description).not.toBe('资料未提供');
      expect(skill).not.toHaveProperty('SPHitBase');
      expect(skill).not.toHaveProperty('ModifierList');
      expect(skill).not.toHaveProperty('ParamList');
    }
  });

  it('删除 appearance 数据并保持当前审计全量可解析', async () => {
    expect(await enemy('5013090')).toMatchObject({ description: '' });
    expect(await enemy('8034010')).not.toHaveProperty('stages');
    const audit = JSON.parse(
      await readFile(path.join(auditRoot, 'latest.json'), 'utf8')
    ).enemyAudit;
    expect(audit.canonicalJoin).toEqual({ resolved: 613, missing: [] });
    expect(audit.weaknessResistanceConflicts).toHaveLength(13);
    expect(audit.unknownDebuffResist).toEqual([]);
    expect(audit.unresolvedSummons).toEqual([]);
    expect(audit.unresolvedSkills).toEqual([]);
    expect(audit.unresolvedExtraEffects).toEqual([]);
  });
});

describe('Enemy Detail presentation', () => {
  it('以 default Monster 初始化轻量阶段引用，并保留结构化属性与召唤路由', async () => {
    const detail = await enemy('8034010');
    const view = buildEnemyDetailView(detail);
    const monster = view.monsters.find(
      (candidate) => candidate.monsterId === view.defaultMonsterId
    )!;
    const sharedSkill = monster.skillPhases
      .flatMap((phase) => phase.skills)
      .find((skill) => skill.id === '803401002')!;

    expect(view).not.toHaveProperty('stats');
    expect(view).not.toHaveProperty('weaknesses');
    expect(monster.summons).toEqual([
      expect.objectContaining({
        monsterId: '8032030',
        monsterTemplateId: '8032030',
        href: '/enemies/8032030'
      })
    ]);
    expect(sharedSkill).toMatchObject({
      name: '分散投资',
      href: '#enemy-skill-803401002',
      damageType: { element: 'Imaginary', name: '虚数' }
    });
    expect(
      monster.skillPhases.filter((phase) => phase.skills.some((skill) => skill.id === '803401002'))
    ).toHaveLength(2);
    expect(view.skillDefinitions.map((skill) => skill.id)).toEqual(
      detail.defaultMonster.skills.map((skill) => skill.id)
    );
  });

  it('完整技能按 default-first 稳定去重，reference anchor 全部命中唯一 target', async () => {
    const detail = await enemy('1002015');
    const canonical = detail.defaultMonster;
    const variantBase = detail.monsters.find((monster) => monster.monsterId === '100201506')!;
    const shared = canonical.skills[1];
    const variantOnly = {
      ...canonical.skills[0],
      id: 'variant-only',
      name: '变体技能',
      phases: [2]
    };
    const variant = {
      ...variantBase,
      skills: [shared, variantOnly],
      skillPhases: [{ index: 2, skillIds: [shared.id, variantOnly.id] }]
    };
    const view = buildEnemyDetailView({
      ...detail,
      monsters: [variant, canonical],
      defaultMonster: canonical
    });

    expect(view.monsters.map((monster) => monster.monsterId)).toEqual([
      variant.monsterId,
      canonical.monsterId
    ]);
    expect(view.skillDefinitions.map((skill) => skill.id)).toEqual([
      ...canonical.skills.map((skill) => skill.id),
      'variant-only'
    ]);
    const targets = view.skillDefinitions.map((skill) => enemySkillAnchorId(skill.id));
    expect(new Set(targets).size).toBe(targets.length);
    for (const reference of view.monsters.flatMap((monster) =>
      monster.skillPhases.flatMap((phase) => phase.skills)
    ))
      expect(targets).toContain(reference.href.slice(1));
  });

  it('保留有/无负面抵抗的 selected Monster 条件数据', async () => {
    const withResistance = buildEnemyDetailView(await enemy('8034010')).monsters.find(
      (monster) => monster.monsterId === '8034010'
    )!;
    const withoutResistance = buildEnemyDetailView(await enemy('3002011')).monsters.find(
      (monster) => monster.monsterId === '3002011'
    )!;
    expect(withResistance.specialResistances.length).toBeGreaterThan(0);
    expect(withoutResistance.specialResistances).toEqual([]);
  });
});
