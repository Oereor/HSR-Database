import path from 'node:path';
import { access } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { readTable } from '../../scripts/data/raw';
import { parseDecimal } from '../../scripts/data/decimal';
import { buildEnemySkillDetails } from '../../scripts/data/enemy-skill-details';
import { parseEnemySkillDetail } from '../../scripts/data/enemy-skill-semantics';
import {
  effectiveSkillParams,
  normalizedActionShift,
  resolveSkillValue
} from '../../scripts/data/enemy-skill-params';
import type { EnemySkillDetailDomain } from '../../src/lib/domain/neutral';

const root = process.env.HSR_DATA_ROOT ?? path.resolve(process.cwd(), '../TurnBasedGameData');
const sourceAvailable = await access(
  path.join(root, 'ExcelOutput', 'MonsterStatusConfig.json')
).then(
  () => true,
  () => false
);

describe('enemy skill parameter foundation', () => {
  it('overlays only supplied positions and resolves direct DynamicValue reads', () => {
    const params = effectiveSkillParams(
      { SkillID: 1, ParamList: [{ Value: '4' }, { Value: '180' }, { Value: '0' }] },
      {
        OverrideSkillParams: [{ BOKJJKFCFME: 1, PBLPLDJKPEI: [{ Value: '3.6' }] }]
      }
    );
    expect(params).toEqual(['3.6', '180', '0']);
    expect(
      resolveSkillValue(
        { IsDynamic: true, PostfixExpr: { OpCodes: 'AQAR', FixedValues: [], DynamicHashes: [-1] } },
        new Map([['Skill01', params]]),
        { '-1': { ReadInfo: { Type: 'SkillParam', TriggerKey: 'Skill01', Index: 0 } } }
      )
    ).toBe('3.6');
  });

  it('normalizes action direction and refuses unsupported expressions', () => {
    expect(normalizedActionShift(parseDecimal('0.5'))).toEqual({ kind: 'delay', ratio: '0.5' });
    expect(normalizedActionShift(parseDecimal('-1'))).toEqual({ kind: 'advance', ratio: '1' });
    expect(
      resolveSkillValue(
        { IsDynamic: true, PostfixExpr: { OpCodes: 'unknown', DynamicHashes: [1] } },
        new Map(),
        {}
      )
    ).toBeUndefined();
  });

  it('stores a configured 1.2 chance only for an identified status', () => {
    const source = {
      monsterId: 'synthetic',
      skillId: '1',
      triggerKey: 'Skill01',
      params: new Map(),
      character: {
        SkillAbilityList: [{ Skill: 'Skill01', AbilityList: ['Apply'] }],
        DynamicValues: { Floats: {} }
      },
      ability: {
        AbilityList: [
          {
            Name: 'Apply',
            OnStart: [
              {
                $type: 'RPG.GameCore.AddModifier',
                TargetType: { Alias: 'AbilityTargetEntity' },
                ModifierName: { Value: 'Mapped' },
                Chance: { IsDynamic: false, FixedValue: { Value: '1.2' } }
              }
            ]
          }
        ]
      },
      statusesByModifier: new Map([['Mapped', 'status-1']])
    };
    expect(parseEnemySkillDetail(source)?.applications).toEqual([
      { statusId: 'status-1', target: 'primary', baseChance: '1.2' }
    ]);
    expect(
      parseEnemySkillDetail({ ...source, statusesByModifier: new Map() })?.applications
    ).toBeUndefined();
    expect(
      parseEnemySkillDetail({
        ...source,
        ability: {
          AbilityList: [
            {
              Name: 'Apply',
              OnStart: [{ ...source.ability.AbilityList[0].OnStart[0], Chance: undefined }]
            }
          ]
        }
      })
    ).toBeUndefined();
    expect(
      parseEnemySkillDetail({
        ...source,
        ability: {
          AbilityList: [
            {
              Name: 'Apply',
              OnStart: [
                {
                  ...source.ability.AbilityList[0].OnStart[0],
                  TargetType: { Alias: 'Caster' }
                }
              ]
            }
          ]
        }
      })?.applications
    ).toEqual([{ statusId: 'status-1', baseChance: '1.2' }]);
    expect(
      parseEnemySkillDetail({
        ...source,
        ability: {
          AbilityList: [
            {
              Name: 'Apply',
              OnStart: [
                source.ability.AbilityList[0].OnStart[0],
                { ...source.ability.AbilityList[0].OnStart[0], Chance: undefined }
              ]
            }
          ]
        }
      })
    ).toBeUndefined();
  });
});

describe.skipIf(!sourceAvailable)('enemy skill production traces', () => {
  let details: Map<string, Map<string, EnemySkillDetailDomain>>;
  const get = (monsterId: string, skillId: string) => details.get(monsterId)?.get(skillId);
  beforeAll(async () => {
    const [templates, monsters, skills, statuses] = await Promise.all([
      readTable<Record<string, any>>(root, 'MonsterTemplateConfig'),
      readTable<Record<string, any>>(root, 'MonsterConfig'),
      readTable<Record<string, any>>(root, 'MonsterSkillConfig'),
      readTable<Record<string, any>>(root, 'MonsterStatusConfig')
    ]);
    const ids = new Set([
      '1022010',
      '1002040',
      '1002030',
      '2004010',
      '1004020',
      '2012010',
      '3003051',
      '4013010',
      '4014012',
      '4064012'
    ]);
    details = await buildEnemySkillDetails(root, {
      MonsterTemplateConfig: templates.filter((row) => ids.has(String(row.MonsterTemplateID))),
      MonsterConfig: monsters,
      MonsterSkillConfig: skills,
      MonsterStatusConfig: statuses
    });
  }, 120_000);

  it('uses the concrete Monster overrides for damage', () => {
    expect(get('1002030', '100203001')?.damage).toEqual([
      { target: 'primary', totals: ['1.3'], scaling: 'attack' },
      { target: 'adjacent', totals: ['1'], scaling: 'attack' }
    ]);
    expect(get('100203026', '100203001')?.damage?.[0].totals).toEqual(['1']);
    expect(get('4064012', '406401201')?.damage?.[0].totals).toEqual(['4']);
    expect(get('406401201', '406401201')?.damage?.[0].totals).toEqual(['3.6']);
    expect(get('100402017', '100402001')?.damage?.[0].totals).toEqual(['2']);
  });

  it('keeps target roles and omits unsupported repeated totals and toughness', () => {
    expect(get('1022010', '102201001')?.damage?.[0]).toMatchObject({
      target: 'primary',
      totals: ['3']
    });
    expect(get('2004010', '200401003')?.damage?.[0]).toMatchObject({
      target: 'all',
      totals: ['2.5']
    });
    expect(get('2012010', '201201002')?.damage?.[0]).toMatchObject({
      target: 'enemy-side',
      totals: ['0.4']
    });
    expect(get('4013010', '401301001')?.damage?.[0]).toMatchObject({
      target: 'each-swept',
      totals: ['2.8']
    });
    expect(get('4064012', '406401207')?.damage).toEqual([
      { target: 'other-marked', totals: ['4'], scaling: 'attack' },
      { target: 'marked', totals: ['12'], scaling: 'attack' }
    ]);
    expect(get('4064012', '406401204')?.damage).toBeUndefined();
    expect(JSON.stringify(get('1022010', '102201001'))).not.toContain('toughness');
  });

  it('publishes only numeric applications with stable status identity', () => {
    expect(get('3003051', '300305101')?.applications).toEqual([
      {
        statusId: '230030501',
        target: 'primary',
        baseChance: '1'
      },
      {
        statusId: '230030502',
        target: 'primary',
        baseChance: '1'
      }
    ]);
    expect(get('1002040', '100204001')?.applications?.[0]).toMatchObject({
      statusId: '210010101',
      baseChance: '1'
    });
    expect(get('2004010', '200401004')?.applications).toBeUndefined();
  });

  it('keeps action shifts and removes obsolete detail-only facts', () => {
    expect(get('1022010', '102201001')?.actionShifts).toEqual([{ kind: 'delay', ratio: '0.5' }]);
    expect(get('2004010', '200401004')?.actionShifts).toEqual([{ kind: 'advance', ratio: '1' }]);
    expect(get('3003051', '300305105')).toBeUndefined();
    expect(get('4013010', '401301005')).toBeUndefined();
    expect(get('4064012', '406401202')).toBeUndefined();
    expect(get('4064012', '406401201')?.applications).toBeUndefined();
  });

  it('does not manufacture bounce totals', () => {
    expect(get('4014012', '401401207')).toBeUndefined();
    expect(get('4014012', '401401208')).toBeUndefined();
  });
});
