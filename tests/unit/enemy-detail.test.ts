import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../../src/lib/domain/types';
import { formatRoundedDecimal } from '../../src/lib/domain/endgame-view';
import {
  compactEnemyStatProgression,
  selectedEnemyMonster,
  getEnemySkillsForMonster,
  getEnemyMonsterStatProgression,
  getEnemyStatsAtLevel
} from '../../src/lib/domain/enemy-view';
import {
  buildEnemySkillPhases,
  normalizeEnemyPhases,
  normalizeEnemySkillKind,
  normalizeEnemySkillTag,
  normalizeSpecialResistances,
  resolveEnemyVariantStats
} from '../../scripts/data/enemy-detail';
import { generatedRoot, auditRoot, assertDataRoot } from '../../scripts/data/paths';

const wrapped = (value: string) => ({ Value: value });
const enemy = async (id: string, locale = 'zh-CN'): Promise<Enemy> =>
  JSON.parse(
    await readFile(
      path.join(generatedRoot, 'views', locale, 'details', 'enemies', `${id}.json`),
      'utf8'
    )
  ) as Enemy;

const defaultMonster = (detail: Enemy) => selectedEnemyMonster(detail, new URLSearchParams());
const defaultSkills = (detail: Enemy) => getEnemySkillsForMonster(detail, detail.defaultMonsterId);

describe('Enemy Detail parser/resolver', () => {
  it('无损生成七项等级属性并对缺失基础字段降级', () => {
    const stats = resolveEnemyVariantStats(
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
    const context = { enemyId: '1002010', skillId: '100201101' };
    expect(normalizeEnemySkillKind({ Hash: '4236760374151560033' }, '技能', context)).toBe('skill');
    expect(normalizeEnemySkillKind({ Hash: '11653660973383561666' }, '任意译文', context)).toBe(
      'talent'
    );
    expect(() => normalizeEnemySkillKind({ Hash: '1' }, '技能', context)).toThrow('SkillTypeDesc');
    expect(normalizeEnemySkillTag({ Hash: '3319273756603801898' }, '弹射', context)).toEqual({
      code: 'Bounce',
      label: '弹射',
      known: true
    });
    expect(() => normalizeEnemySkillTag({ Hash: '1' }, '弹射', context)).toThrow('SkillTag');
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

  it('仅用投影后的技能构建阶段，保留共享技能和原始顺序', () => {
    expect(
      buildEnemySkillPhases([
        { id: 'shared', phases: [] },
        { id: 'later', phases: [3, 2, 3, 0] },
        { id: 'last', phases: [3] }
      ])
    ).toEqual([
      { index: 2, skillIds: ['shared', 'later'] },
      { index: 3, skillIds: ['shared', 'later', 'last'] }
    ]);
    expect(buildEnemySkillPhases([{ id: 'visible-later', phases: [2] }])).toEqual([
      { index: 2, skillIds: ['visible-later'] }
    ]);
    expect(buildEnemySkillPhases([{ id: 'single', phases: [] }])).toEqual([
      { index: 1, skillIds: ['single'] }
    ]);
    expect(buildEnemySkillPhases([])).toEqual([{ index: 1, skillIds: [] }]);
  });
});

describe('Enemy Detail 真实数据回归', () => {
  it('从 MonsterTemplateConfig 无损透传 Template 比例字段', async () => {
    const templates = JSON.parse(
      await readFile(
        path.join(assertDataRoot(), 'ExcelOutput', 'MonsterTemplateConfig.json'),
        'utf8'
      )
    ) as Array<{
      MonsterTemplateID: number;
      CriticalDamageBase: { Value: number | string };
      InitialDelayRatio?: { Value: number | string };
    }>;
    const raw = templates.find((template) => template.MonsterTemplateID === 1004014)!;
    const detail = await enemy(String(raw.MonsterTemplateID));

    expect(detail.template.baseStats.criticalDamage).toBe(String(raw.CriticalDamageBase.Value));
    expect(detail.template.baseStats.initialDelayRatio).toBe(String(raw.InitialDelayRatio!.Value));

    const missing = templates.find((template) => template.MonsterTemplateID === 3002040)!;
    expect((await enemy(String(missing.MonsterTemplateID))).template.baseStats).not.toHaveProperty(
      'initialDelayRatio'
    );
  });

  it.each(['zh-CN', 'en'])(
    'projects the selected Monster’s own text and stats in %s',
    async (locale) => {
      const detail = await enemy('1002015', locale);
      const illusion = selectedEnemyMonster(detail, new URLSearchParams('monster=100201501'));
      const security = selectedEnemyMonster(detail, new URLSearchParams('monster=100201506'));
      expect(detail.template.monsterTemplateId).toBe('1002015');
      expect(illusion.monsterId).toBe('100201501');
      expect(security.monsterId).toBe('100201506');
      expect(new Set([detail.template.name, illusion.name, security.name]).size).toBe(3);
      expect(illusion.introduction).toBeTruthy();
      expect(security.introduction).toBeTruthy();
      expect(illusion.introduction).not.toBe(security.introduction);
      expect(illusion.weaknesses.map(({ element }) => element)).toEqual(['Fire', 'Lightning']);
      expect(security.weaknesses.map(({ element }) => element)).toEqual(['Fire', 'Quantum']);
      expect(security.resistances).not.toEqual(illusion.resistances);
      expect(getEnemyMonsterStatProgression(detail, security)).not.toEqual(
        getEnemyMonsterStatProgression(detail, illusion)
      );
      expect(security.skills.map(({ id }) => id)).toEqual(illusion.skills.map(({ id }) => id));
      expect(detail).not.toHaveProperty('description');
      expect(detail).not.toHaveProperty('defaultMonster');
      for (const params of [
        'monster=10020150',
        'monster=100204004',
        'monster=100201501&monster=100201506'
      ]) {
        expect(selectedEnemyMonster(detail, new URLSearchParams(params)).monsterId).toBe(
          detail.defaultMonsterId
        );
      }

      const guard = await enemy('1002040', locale);
      const missingName = selectedEnemyMonster(guard, new URLSearchParams('monster=100204004'));
      expect(missingName.name).toBe(guard.template.name);
      expect(missingName.introduction).toBeTruthy();
      const missingIntroduction = defaultMonster(await enemy('5013090', locale));
      expect(missingIntroduction.name).toBeTruthy();
      expect(missingIntroduction).not.toHaveProperty('introduction');
    }
  );

  it('8034010 包含 Lv.95 七项属性、弱点抗性、召唤与多阶段技能', async () => {
    const aventurine = await enemy('8034010');
    const monster = defaultMonster(aventurine);
    const row = getEnemyStatsAtLevel(getEnemyMonsterStatProgression(aventurine, monster), 95)!;
    expect(
      [row.hp, row.attack, row.defence, row.speed, row.toughness].map((value) =>
        value ? formatRoundedDecimal(value) : 'unavailable'
      )
    ).toEqual(['657,149', '718', '1,150', '158', '150']);
    expect(row.effectHit).toBe('0.36');
    expect(row.effectResistance).toBe('0.4');
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
      label: '控制抵抗',
      value: '0.5'
    });
    expect(monster.summons).toEqual([
      expect.objectContaining({ monsterId: '8032030', monsterTemplateId: '8032030' })
    ]);
    expect(defaultSkills(aventurine).find((skill) => skill.id === '803401002')).toMatchObject({
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
    expect(defaultMonster(await enemy('3002011')).skillPhases.map((phase) => phase.index)).toEqual([
      1
    ]);

    const twoPhase = defaultMonster(await enemy('1005010'));
    expect(twoPhase.skillPhases.map((phase) => phase.index)).toEqual([1, 2]);
    expect(twoPhase.skillPhases[0].skillIds).toContain('100501001');
    expect(twoPhase.skillPhases[0].skillIds).not.toContain('100501005');
    expect(twoPhase.skillPhases[1].skillIds).toContain('100501005');
    expect(twoPhase.skillPhases.every((phase) => phase.skillIds.includes('100501003'))).toBe(true);

    const threePhase = defaultMonster(await enemy('1004011'));
    expect(threePhase.skillPhases.map((phase) => phase.index)).toEqual([1, 2, 3]);
    expect(threePhase.skillPhases.every((phase) => phase.skillIds.includes('100401101'))).toBe(
      true
    );
    expect(
      threePhase.skillPhases.slice(1).every((phase) => phase.skillIds.includes('100401103'))
    ).toBe(true);

    expect(defaultMonster(await enemy('4014022')).skillPhases.map((phase) => phase.index)).toEqual([
      2, 3
    ]);
  });

  it('技能仅发布安全字段，并保持 ExtraEffect 与缺失 DamageType 的边界', async () => {
    const extra = defaultSkills(await enemy('1004014')).find((skill) => skill.id === '100401411')!;
    expect(extra.extraEffects).toContainEqual(
      expect.objectContaining({ id: '70000304', name: '转移' })
    );
    expect(defaultSkills(await enemy('1004014')).some((skill) => skill.id === '100401414')).toBe(
      false
    );
    const missingDamage = defaultSkills(await enemy('4034013')).find(
      (skill) => skill.id === '403401302'
    )!;
    expect(missingDamage).not.toHaveProperty('damageType');
    for (const [enemyId, skillId] of [
      ['3002011', '300201102'],
      ['1004010', '100401005']
    ]) {
      const skill = defaultSkills(await enemy(enemyId)).find(
        (candidate) => candidate.id === skillId
      )!;
      expect(skill.description.trim().length).toBeGreaterThan(0);
      expect(skill).not.toHaveProperty('SPHitBase');
      expect(skill).not.toHaveProperty('ModifierList');
      expect(skill).not.toHaveProperty('ParamList');
    }
  });

  it('删除 appearance 数据并保持当前审计全量可解析', async () => {
    expect(await enemy('5013090')).not.toHaveProperty('description');
    expect(await enemy('8034010')).not.toHaveProperty('stages');
    const audit = JSON.parse(
      await readFile(path.join(auditRoot, 'latest.json'), 'utf8')
    ).enemyAudit;
    const files = await readdir(path.join(generatedRoot, 'views', 'zh-CN', 'details', 'enemies'));
    expect(audit.defaultSelection).toEqual({ sameId: files.length, fallback: [] });
    expect(
      audit.weaknessResistanceConflicts.some(
        ({ enemyId }: { enemyId: string }) => enemyId.length > 7
      )
    ).toBe(true);
    expect(audit.unknownDebuffResist).toEqual([]);
    expect(audit.unresolvedSummons).toEqual([]);
    expect(audit.unresolvedSkills).toEqual([]);
    expect(audit.unresolvedExtraEffects).toEqual([]);
  });
});

describe('Enemy Detail presentation', () => {
  it('keeps separately referenced summons even if they share a Template', async () => {
    const source = defaultMonster(await enemy('1004015'));
    const summons = source.summons.filter(
      ({ monsterTemplateId }) => monsterTemplateId === '1002015'
    );
    expect(summons.map(({ monsterId }) => monsterId)).toEqual(['100201508', '100201509']);
    const target = await enemy('1002015');
    for (const summon of summons) {
      const href = new URL(summon.href, 'https://example.test');
      const variant = selectedEnemyMonster(target, href.searchParams);
      expect(variant.monsterId).toBe(summon.monsterId);
      expect(summon.name).toBe(variant.name);
      expect(summon.weaknesses).toEqual(variant.weaknesses);
    }
  });

  it('resolves only the selected Monster’s ordered skill bindings and phase references', async () => {
    const detail = await enemy('5013030');
    const baseline = defaultSkills(detail);
    const variant = getEnemySkillsForMonster(detail, '501303001');
    expect(variant.length).toBeLessThan(baseline.length);
    const definitionIds = detail.skillDefinitions.map(({ id }) => id);
    expect(new Set(definitionIds).size).toBe(definitionIds.length);
    expect(variant.every(({ id }) => definitionIds.includes(id))).toBe(true);
  });

  it('shares identical progression series and rejects invalid references', async () => {
    const detail = await enemy('8002050');
    expect(detail.statProgressions.length).toBeLessThan(detail.monsters.length);
    expect(new Set(detail.monsters.map(({ statsRef }) => statsRef)).size).toBe(
      detail.statProgressions.length
    );
    expect(() =>
      getEnemyMonsterStatProgression(detail, {
        ...detail.monsters[0],
        statsRef: detail.statProgressions.length
      })
    ).toThrow('无效属性进度');
  });

  it('looks up sparse levels by their real values', () => {
    const missing = { status: 'unavailable', reason: 'missing-base' } as const;
    const row = {
      hp: missing,
      attack: missing,
      defence: missing,
      speed: missing,
      toughness: missing,
      effectHit: missing,
      effectResistance: missing
    };
    const compact = compactEnemyStatProgression({
      minLevel: 1,
      maxLevel: 5,
      defaultLevel: 5,
      levels: [
        { level: 1, ...row },
        { level: 5, ...row }
      ]
    });
    expect(compact.availableLevels).toEqual([1, 5]);
    expect(getEnemyStatsAtLevel(compact, 2)).toBeUndefined();
    expect(getEnemyStatsAtLevel(compact, 5)?.speed).toBeNull();
  });
});
