import { describe, expect, it } from 'vitest';
import { buildEnemyDomain } from '../../scripts/data/domain/enemy';
import { createTextResolver } from '../../scripts/data/localization';
import { projectEnemies } from '../../scripts/data/projection/enemy';

const wrapped = (Value: string | number) => ({ Value });
const hash = (Hash: string) => ({ Hash });

function sourceTables(
  skill: Record<string, unknown> | Record<string, unknown>[],
  skillIds = [1]
) {
  return {
    MonsterTemplateConfig: [
      {
        MonsterTemplateID: 100,
        MonsterName: hash('1000'),
        Rank: 'Normal',
        HPBase: wrapped('100'),
        AttackBase: wrapped('20'),
        DefenceBase: wrapped('10'),
        CriticalDamageBase: wrapped('1.5'),
        SpeedBase: wrapped('100'),
        StanceBase: wrapped('60'),
        StatusResistanceBase: wrapped('0.2'),
        InitialDelayRatio: wrapped('0.5')
      },
      {
        MonsterTemplateID: 200,
        MonsterName: hash('2000'),
        Rank: 'Minion',
        HPBase: wrapped('50'),
        AttackBase: wrapped('10'),
        DefenceBase: wrapped('5'),
        CriticalDamageBase: wrapped('1.5'),
        SpeedBase: wrapped('80'),
        StanceBase: wrapped('30'),
        StatusResistanceBase: wrapped('0.1')
      }
    ],
    MonsterConfig: [
      {
        MonsterID: 100,
        MonsterTemplateID: 100,
        HardLevelGroup: 1,
        EliteGroup: 1,
        HPModifyRatio: wrapped('1'),
        AttackModifyRatio: wrapped('1'),
        DefenceModifyRatio: wrapped('1'),
        SpeedModifyRatio: wrapped('1'),
        StanceModifyRatio: wrapped('1'),
        StanceWeakList: ['Fire'],
        DamageTypeResistance: [],
        DebuffResist: [],
        SkillList: skillIds,
        SummonIDList: [200]
      },
      {
        MonsterID: 200,
        MonsterTemplateID: 200,
        HardLevelGroup: 1,
        EliteGroup: 1,
        HPModifyRatio: wrapped('1'),
        AttackModifyRatio: wrapped('1'),
        DefenceModifyRatio: wrapped('1'),
        SpeedModifyRatio: wrapped('1'),
        StanceModifyRatio: wrapped('1'),
        StanceWeakList: ['Ice'],
        DamageTypeResistance: [],
        DebuffResist: [],
        SkillList: [],
        SummonIDList: []
      }
    ],
    MonsterSkillConfig: Array.isArray(skill) ? skill : [skill],
    DamageType: [{ ID: 'Fire', DamageTypeName: hash('3000') }],
    HardLevelGroup: [
      {
        HardLevelGroup: 1,
        Level: 1,
        HPRatio: wrapped('1'),
        AttackRatio: wrapped('1'),
        DefenceRatio: wrapped('1'),
        SpeedRatio: wrapped('1'),
        StanceRatio: wrapped('1'),
        StatusProbability: wrapped('0'),
        StatusResistance: wrapped('0')
      }
    ],
    EliteGroup: [
      {
        EliteGroup: 1,
        HPRatio: wrapped('1'),
        AttackRatio: wrapped('1'),
        DefenceRatio: wrapped('1'),
        SpeedRatio: wrapped('1'),
        StanceRatio: wrapped('1')
      }
    ]
  };
}

describe('EnemyDomain', () => {
  it('retains neutral TextRefs, stable IDs, and configured skills without a display snapshot', () => {
    const skill = {
      SkillID: 1,
      SkillName: hash('4000'),
      SkillDesc: hash('4001'),
      SkillTypeDesc: hash('4236760374151560033'),
      SkillTag: hash('3319273756603801898'),
      PhaseList: [1],
      ParamList: [wrapped('2')],
      ExtraEffectIDList: []
    };
    const tables = sourceTables(skill);
    const result = buildEnemyDomain({ tables });
    const enemy = result.enemies.find((item) => item.id === '100')!;
    const domainSkill = enemy.monsters[0].skills[0];

    expect(enemy.template.baseStats.initialDelayRatio).toBe('0.5');
    expect(result.enemies.find((item) => item.id === '200')!.template.baseStats).not.toHaveProperty(
      'initialDelayRatio'
    );

    expect(domainSkill).toMatchObject({
      id: '1',
      kind: 'skill',
      tagCode: 'Bounce'
    });
    expect(domainSkill).not.toHaveProperty('included');
    expect(enemy.monsters[0]).not.toHaveProperty('skillPhases');
    expect(domainSkill.nameSource).toEqual({ kind: 'direct', ref: { kind: 'hash', hash: '4000' } });
    expect(domainSkill.descriptionSource).toEqual({
      kind: 'parameterized',
      ref: { kind: 'hash', hash: '4001' },
      params: ['2']
    });
    expect(enemy.monsters[0].summons).toEqual([
      expect.objectContaining({ monsterId: '200', monsterTemplateId: '200', rank: 'Minion' })
    ]);
    expect(JSON.stringify(result.enemies)).not.toContain('敌人');
    expect(JSON.stringify(result.enemies)).not.toContain('技能 1');
  });

  it('fails closed for unknown semantic hashes', () => {
    const skill = {
      SkillID: 1,
      SkillName: hash('4000'),
      SkillDesc: hash('4001'),
      SkillTypeDesc: hash('999999'),
      SkillTag: hash('3319273756603801898'),
      PhaseList: [1],
      ParamList: [],
      ExtraEffectIDList: []
    };
    expect(() => buildEnemyDomain({ tables: sourceTables(skill) })).toThrow(
      /Unknown enemy skill source/
    );
    expect(() =>
      buildEnemyDomain({
        tables: sourceTables({
          ...skill,
          SkillTypeDesc: hash('4236760374151560033'),
          SkillTag: hash('999999')
        })
      })
    ).toThrow(/Unknown enemy skill source/);
  });

  it('projects each locale from its description and accepts changed or newly configured rows', async () => {
    const skill = (id: number, descriptionHash: string, phases: number[]) => ({
      SkillID: id,
      SkillName: hash('4000'),
      SkillDesc: hash(descriptionHash),
      SkillTypeDesc: hash('4236760374151560033'),
      SkillTag: hash('3319273756603801898'),
      PhaseList: phases,
      ParamList: [],
      ExtraEffectIDList: [],
      SPHitBase: wrapped('42')
    });
    const domain = buildEnemyDomain({
      tables: sourceTables(
        [skill(1, '4001', [2]), skill(2, '4002', [1]), skill(3, '4003', [3])],
        [1, 2, 1, 3]
      )
    }).enemies;
    expect(() =>
      buildEnemyDomain({
        tables: sourceTables(
          [
            { ...skill(1, '4001', [2]), SPHitBase: wrapped('99') },
            skill(2, '4002', [1]),
            skill(3, '4003', [3])
          ],
          [1, 2, 1, 3]
        )
      })
    ).not.toThrow();
    const byId = new Map(domain.map((enemy) => [enemy.id, enemy]));
    const text: Record<string, string> = {
      '4000': 'Skill',
      '4001': 'Visible',
      '4003': 'Also visible',
      '4236760374151560033': 'Skill',
      '3319273756603801898': 'Bounce'
    };
    const project = async (locale: 'zh-CN' | 'en', map: Record<string, string>) =>
      projectEnemies(domain, {
        resolver: await createTextResolver(
          { locale, textMapCode: locale === 'zh-CN' ? 'CHS' : 'EN' },
          map
        ),
        enemiesById: byId,
        extraEffectsById: new Map()
      }).enemies.find((enemy) => enemy.id === '100')!.defaultMonster;
    const chinese = await project('zh-CN', text);
    expect(chinese.skills.map(({ id }) => id)).toEqual(['1', '3']);
    expect(chinese.skillPhases).toEqual([
      { index: 2, skillIds: ['1'] },
      { index: 3, skillIds: ['3'] }
    ]);
    const english = await project('en', { ...text, '4001': ' ', '4002': 'English text' });
    expect(english.skills.map(({ id }) => id)).toEqual(['2', '3']);
    expect(english.skillPhases).toEqual([
      { index: 1, skillIds: ['2'] },
      { index: 3, skillIds: ['3'] }
    ]);
  });
});
