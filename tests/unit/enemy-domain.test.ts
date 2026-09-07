import { describe, expect, it } from 'vitest';
import { enemySkillSourceSignature } from '../../scripts/data/enemy-skill-policy';
import { buildEnemyDomain } from '../../scripts/data/domain/enemy';

const wrapped = (Value: string | number) => ({ Value });
const hash = (Hash: string) => ({ Hash });

function sourceTables(skill: Record<string, unknown>) {
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
        StatusResistanceBase: wrapped('0.2')
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
        SkillList: [1],
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
    MonsterSkillConfig: [skill],
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
  it('retains neutral TextRefs, stable IDs, and structural skill inclusion state', () => {
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
    const result = buildEnemyDomain({
      tables,
      inclusionPolicy: {
        schemaVersion: 1,
        sourceCommit: 'test',
        reason: 'test',
        skills: {
          '1': {
            sourceSignature: enemySkillSourceSignature(skill),
            included: false,
            descriptionHash: null
          }
        }
      }
    });
    const enemy = result.enemies.find((item) => item.id === '100')!;
    const domainSkill = enemy.monsters[0].skills[0];

    expect(domainSkill).toMatchObject({
      id: '1',
      kind: 'skill',
      tagCode: 'Bounce',
      included: false
    });
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
    expect(() =>
      buildEnemyDomain({
        tables: sourceTables(skill),
        inclusionPolicy: {
          schemaVersion: 1,
          sourceCommit: 'test',
          reason: 'test',
          skills: {
            '1': {
              sourceSignature: enemySkillSourceSignature(skill),
              included: true,
              descriptionHash: null
            }
          }
        }
      })
    ).toThrow(/Unknown enemy skill source/);
  });
});
