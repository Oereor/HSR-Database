import path from 'node:path';
import { access } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { readTable } from '../../scripts/data/raw';
import { decimalEquals, parseDecimal } from '../../scripts/data/decimal';
import { buildEnemySkillDetails } from '../../scripts/data/enemy-skill-details';
import { parseEnemySkillDetail } from '../../scripts/data/enemy-skill-semantics';
import { normalizeEnemySkillMultipliers } from '../../scripts/data/enemy-skill-damage';
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

  it('multiplies only the verified dynamic-first SkillParam and fixed-value shape', () => {
    const expression = (factor: string, opCodes = 'AQAAAAQR') => ({
      IsDynamic: true,
      PostfixExpr: {
        OpCodes: opCodes,
        FixedValues: [{ Value: factor }],
        DynamicHashes: [-1126825319]
      }
    });
    const params = new Map([['Skill01', [parseDecimal('2.5')]]]);
    const floats = {
      '-1126825319': { ReadInfo: { Type: 'SkillParam', TriggerKey: 'Skill01', Index: 0 } }
    };
    expect(resolveSkillValue(expression('0.5'), params, floats)).toBe('1.25');
    expect(resolveSkillValue(expression('0.125'), params, floats)).toBe('0.3125');
    expect(
      decimalEquals(resolveSkillValue(expression('0'), params, floats)!, parseDecimal('0'))
    ).toBe(true);

    const overridden = effectiveSkillParams(
      { SkillID: 1, ParamList: [{ Value: '2.5' }] },
      { OverrideSkillParams: [{ BOKJJKFCFME: 1, PBLPLDJKPEI: [{ Value: '3.2' }] }] }
    );
    expect(resolveSkillValue(expression('0.5'), new Map([['Skill01', overridden]]), floats)).toBe(
      '1.60'
    );

    expect(resolveSkillValue(expression('0.5', 'AAABAAQR'), params, floats)).toBeUndefined();
    expect(
      resolveSkillValue(
        {
          ...expression('0.5'),
          PostfixExpr: { ...expression('0.5').PostfixExpr, DynamicHashes: [1, 2] }
        },
        params,
        floats
      )
    ).toBeUndefined();
    expect(
      resolveSkillValue(
        {
          ...expression('0.5'),
          PostfixExpr: { ...expression('0.5').PostfixExpr, NestedExpr: {} }
        },
        params,
        floats
      )
    ).toBeUndefined();
    expect(
      resolveSkillValue(
        {
          ...expression('0.5'),
          PostfixExpr: {
            ...expression('0.5').PostfixExpr,
            FixedValues: [{ Value: '0.5' }, { Value: '2' }]
          }
        },
        params,
        floats
      )
    ).toBeUndefined();
    expect(
      resolveSkillValue(expression('0.5'), params, {
        '-1126825319': { ReadInfo: { Type: 'DynamicValue', TriggerKey: 'Skill01', Index: 0 } }
      })
    ).toBeUndefined();
    expect(
      resolveSkillValue(expression('0.5'), params, {
        '-1126825319': { ReadInfo: { Type: 'SkillParam', TriggerKey: 'Missing', Index: 0 } }
      })
    ).toBeUndefined();
  });

  it.each([-1, 0.5, 1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid/out-of-range SkillParam index %s',
    (index) => {
      expect(
        resolveSkillValue(
          {
            IsDynamic: true,
            PostfixExpr: { OpCodes: 'AQAR', FixedValues: [], DynamicHashes: [7] }
          },
          new Map([['Skill01', [parseDecimal('2')]]]),
          { '7': { ReadInfo: { Type: 'SkillParam', TriggerKey: 'Skill01', Index: index } } }
        )
      ).toBeUndefined();
    }
  );

  it('retains a configured 1.2 chance with or without status identity', () => {
    const source = {
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
    ).toEqual([{ target: 'primary', baseChance: '1.2' }]);
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
      })?.applications
    ).toEqual([{ statusId: 'status-1', target: 'primary', baseChance: '1.2' }]);
  });
});

describe('base chance application identity', () => {
  const add = (modifier: string, chance: unknown, target = 'AbilityTargetEntity') => ({
    $type: 'RPG.GameCore.AddModifier',
    TargetType: { Alias: target },
    ModifierName: { Value: modifier },
    Chance: chance
  });
  const fixed = (value: string) => ({ IsDynamic: false, FixedValue: { Value: value } });
  const parse = (tasks: unknown[], statuses: [string, string][] = []) =>
    parseEnemySkillDetail({
      skillId: 'synthetic',
      triggerKey: 'Skill01',
      params: new Map(),
      character: {
        SkillAbilityList: [{ Skill: 'Skill01', AbilityList: ['Apply'] }],
        DynamicValues: { Floats: {} }
      },
      ability: { AbilityList: [{ Name: 'Apply', OnStart: tasks }] },
      statusesByModifier: new Map(statuses)
    });

  it('keeps the same status on different targets and different named statuses', () => {
    expect(
      parse(
        [
          add('Burn', fixed('0.8')),
          add('Burn', fixed('0.8'), 'AbilityTargetAdjoinEntity'),
          add('Slow', fixed('0.5'))
        ],
        [
          ['Burn', 'burn-id'],
          ['Slow', 'slow-id']
        ]
      )?.applications
    ).toEqual([
      { statusId: 'burn-id', target: 'primary', baseChance: '0.8' },
      { statusId: 'burn-id', target: 'adjacent', baseChance: '0.8' },
      { statusId: 'slow-id', target: 'primary', baseChance: '0.5' }
    ]);
  });

  it('collapses identical anonymous facts and rejects indistinguishable different chances', () => {
    expect(parse([add('One', fixed('1')), add('Two', fixed('1.0'))])?.applications).toEqual([
      { target: 'primary', baseChance: '1' }
    ]);
    expect(
      parse([add('One', fixed('0.5')), add('Two', fixed('0.8'))])?.applications
    ).toBeUndefined();
    expect(
      parse([add('Named', fixed('0.5')), add('Anonymous', fixed('0.8'))], [['Named', 'named-id']])
        ?.applications
    ).toEqual([{ statusId: 'named-id', target: 'primary', baseChance: '0.5' }]);
    expect(
      parse([add('One', fixed('0.5')), add('Two', fixed('0.8'), 'AbilityTargetAdjoinEntity')])
        ?.applications
    ).toEqual([
      { target: 'primary', baseChance: '0.5' },
      { target: 'adjacent', baseChance: '0.8' }
    ]);
  });

  it('omits unsupported chance expressions while preserving an independent action shift', () => {
    const unsupported = { IsDynamic: true, PostfixExpr: { OpCodes: 'AQAAAAQR' } };
    expect(parse([add('One', unsupported)])).toBeUndefined();
    expect(parse([add('One', fixed('0.8')), add('One', unsupported)])).toBeUndefined();
    expect(parse([add('One', fixed('0.8'), 'AllLightTeam')])).toBeUndefined();
    expect(
      parse([
        add('One', fixed('1.2')),
        { $type: 'RPG.GameCore.ModifyActionDelay', AddNormalizedValue: fixed('-1') }
      ])
    ).toEqual({
      applications: [{ target: 'primary', baseChance: '1.2' }],
      actionShifts: [{ kind: 'advance', ratio: '1' }]
    });
  });
});

describe('static damage multiplier candidates', () => {
  it('deduplicates equivalent decimals and orders multiplier candidates numerically', () => {
    expect(
      normalizeEnemySkillMultipliers(['10', '1.0', '2', '1'].map((value) => parseDecimal(value)))
    ).toEqual(['1.0', '2', '10']);
  });
  const hit = (ratio: string, target = 'AbilityTargetEntity') => ({
    $type: 'RPG.GameCore.DamageByAttackProperty',
    TargetType: { Alias: target },
    AttackProperty: { DamagePercentage: { IsDynamic: false, FixedValue: { Value: ratio } } }
  });
  const source = (onStart: unknown[], otherAbilities: unknown[] = []) => ({
    skillId: 'synthetic',
    triggerKey: 'Skill01',
    params: new Map(),
    character: {
      SkillAbilityList: [
        {
          Skill: 'Skill01',
          AbilityList: ['Execute', ...otherAbilities.map((_, index) => `Other${index}`)]
        }
      ],
      DynamicValues: { Floats: {} }
    },
    ability: {
      AbilityList: [
        { Name: 'Execute', OnStart: onStart },
        ...otherAbilities.map((row, index) => ({ Name: `Other${index}`, OnStart: row }))
      ]
    },
    statusesByModifier: new Map<string, string>()
  });

  it('sums same-path hits exactly and keeps other target roles separate', () => {
    expect(
      parseEnemySkillDetail(source([hit('0.1'), hit('0.2'), hit('2', 'AbilityTargetAdjoinEntity')]))
        ?.damage
    ).toEqual([
      { target: 'primary', multipliers: ['0.3'], scaling: 'attack' },
      { target: 'adjacent', multipliers: ['2'], scaling: 'attack' }
    ]);
  });

  const branch = (success: unknown[], failed: unknown[] = []) => ({
    $type: 'RPG.GameCore.PredicateTaskList',
    SuccessTaskList: success,
    FailedTaskList: failed
  });
  const unknownHit = {
    ...hit('2'),
    AttackProperty: { DamagePercentage: { IsDynamic: true, PostfixExpr: { OpCodes: 'AQABAQQR' } } }
  };

  it('unions branch and ability candidates without prefix/branch or cross-ability sums', () => {
    expect(
      parseEnemySkillDetail(
        source([hit('3'), branch([hit('2')], [hit('4')])], [[hit('6'), hit('6')]])
      )?.damage
    ).toEqual([{ target: 'primary', multipliers: ['2', '3', '4', '12'], scaling: 'attack' }]);
  });

  it('aggregates within branches and callbacks but never across callbacks', () => {
    expect(
      parseEnemySkillDetail(
        source([
          branch([hit('0.1'), hit('0.2')], [hit('0.3')]),
          { $type: 'RPG.GameCore.FireProjectile', OnProjectileHit: [hit('1'), hit('1'), hit('1')] },
          { $type: 'RPG.GameCore.FireProjectile', OnProjectileHit: [hit('2')] }
        ])
      )?.damage
    ).toEqual([{ target: 'primary', multipliers: ['0.3', '2', '3'], scaling: 'attack' }]);
  });

  it('keeps known siblings without publishing a partial local sum', () => {
    const diagnostics: string[] = [];
    expect(
      parseEnemySkillDetail({
        ...source([hit('3'), unknownHit, hit('4')]),
        onDamageDiagnostic: (reason) => diagnostics.push(reason)
      })?.damage
    ).toEqual([{ target: 'primary', multipliers: ['3', '4'], scaling: 'attack' }]);
    expect(diagnostics).toEqual(['damage-unsupported-expression']);
    expect(
      parseEnemySkillDetail(source([branch([hit('2.2')], [unknownHit])]))?.damage?.[0].multipliers
    ).toEqual(['2.2']);
  });

  it('keeps loop values without multiplying by count or summing outer hits', () => {
    expect(
      parseEnemySkillDetail(
        source([
          hit('2'),
          {
            $type: 'RPG.GameCore.LoopExecuteTaskList',
            Count: 5,
            TaskList: [hit('0.9')]
          },
          hit('3')
        ])
      )?.damage?.[0].multipliers
    ).toEqual(['0.9', '2', '3']);
  });

  it('separates unmapped target candidates and does not aggregate their different entities', () => {
    expect(
      parseEnemySkillDetail(
        source([hit('3'), hit('2', 'ParamEntity'), hit('4', 'ProjectileHitEntity')])
      )?.damage
    ).toEqual([
      { target: 'primary', multipliers: ['3'], scaling: 'attack' },
      { multipliers: ['2', '4'], scaling: 'attack' }
    ]);
  });

  it('degrades retargeted entity roles without discarding numbers or summing roles', () => {
    expect(
      parseEnemySkillDetail(
        source([
          { $type: 'RPG.GameCore.Retarget' },
          branch(
            [hit('1.1'), hit('0.9', 'AbilityTargetAdjoinEntity')],
            [hit('2.2'), hit('1.8', 'AbilityTargetAdjoinEntity')]
          )
        ])
      )?.damage
    ).toEqual([{ multipliers: ['0.9', '1.1', '1.8', '2.2'], scaling: 'attack' }]);
  });

  it('preserves local aggregation before a later retarget', () => {
    expect(
      parseEnemySkillDetail(
        source([hit('3'), hit('3'), hit('3'), { $type: 'RPG.GameCore.Retarget' }])
      )?.damage
    ).toEqual([{ target: 'primary', multipliers: ['9'], scaling: 'attack' }]);
  });

  it('does not suppress static values because an unrelated dynamic key is written', () => {
    expect(
      parseEnemySkillDetail(
        source([
          { $type: 'RPG.GameCore.SetDynamicValue', DynamicKey: 'Unrelated' },
          hit('0.1'),
          hit('0.2')
        ])
      )?.damage?.[0].multipliers
    ).toEqual(['0.3']);
  });

  it('rejects a runtime numeric dependency but retains an independent parameter value', () => {
    const dynamicHit = {
      ...hit('2'),
      AttackProperty: {
        DamagePercentage: {
          IsDynamic: true,
          PostfixExpr: { OpCodes: 'AQAR', FixedValues: [], DynamicHashes: [7] }
        }
      }
    };
    const fixture = source([
      { $type: 'RPG.GameCore.SetDynamicValue', DynamicKey: 'RuntimeDamage' },
      dynamicHit,
      hit('2.2')
    ]);
    fixture.character.DynamicValues.Floats = {
      '7': { ReadInfo: { Type: 'DynamicValue', Key: 'RuntimeDamage' } }
    };
    expect(parseEnemySkillDetail(fixture)?.damage?.[0].multipliers).toEqual(['2.2']);
  });

  it('rejects malformed, negative, unresolved and non-attack-scaling values individually', () => {
    expect(
      parseEnemySkillDetail(
        source([
          hit('-1'),
          hit('bad'),
          unknownHit,
          { ...hit('6'), $type: 'RPG.GameCore.DamageByHPProperty' },
          hit('2')
        ])
      )?.damage
    ).toEqual([{ target: 'primary', multipliers: ['2'], scaling: 'attack' }]);
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
      '1002011',
      '1002020',
      '1002041',
      '1003010',
      '1004010',
      '1013010',
      '1022010',
      '1002040',
      '1002030',
      '2004010',
      '3024010',
      '3003013',
      '1004020',
      '2012010',
      '3003051',
      '4013010',
      '4014012',
      '4014018',
      '2034010',
      '8003050',
      '4064012',
      '4035010',
      '8012010'
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
      { target: 'primary', multipliers: ['1.3'], scaling: 'attack' },
      { target: 'adjacent', multipliers: ['1'], scaling: 'attack' }
    ]);
    expect(get('100203026', '100203001')?.damage?.[0].multipliers).toEqual(['1']);
    expect(get('4064012', '406401201')?.damage?.[0].multipliers).toEqual(['4']);
    expect(get('406401201', '406401201')?.damage?.[0].multipliers).toEqual(['3.6']);
    expect(get('100402017', '100402001')?.damage?.[0].multipliers).toEqual(['2']);
    expect(get('4035010', '403501001')?.damage?.[0].multipliers).toEqual(['4.5']);
    expect(get('403501001', '403501001')?.damage?.[0].multipliers).toEqual(['4']);
  });

  it('extracts direct damage through the shared collector', () => {
    expect(get('1002011', '100201101')?.damage).toEqual([
      { target: 'all', multipliers: ['2'], scaling: 'attack' }
    ]);
    expect(get('1002020', '100202001')?.damage).toEqual([
      { target: 'primary', multipliers: ['2.5'], scaling: 'attack' }
    ]);
    expect(get('1002041', '100204101')?.damage?.[0].multipliers).toEqual(['3']);
    expect(get('1003010', '100301001')?.damage?.[0].multipliers).toEqual(['3']);
  });

  it('keeps bounded expression support while allowing wrapped values', () => {
    expect(get('2004010', '200401001')?.damage).toEqual([
      { target: 'primary', multipliers: ['2.5'], scaling: 'attack' }
    ]);
    expect(get('1013010', '101301004')?.damage?.[0].multipliers).toEqual(['4']);
    expect(get('3024010', '302401005')?.damage?.[0].multipliers).toEqual(['3.6']);
    expect(get('302401013', '302401005')?.damage?.[0].multipliers).toEqual(['1.75']);
    expect(get('8012010', '801201001')?.damage?.[0].multipliers).toEqual(['2.5']);
    expect(get('1004010', '100401003')?.damage?.[0].multipliers).toEqual(['5']);
  });

  it('keeps target roles and local aggregates without exposing toughness', () => {
    expect(get('1022010', '102201001')?.damage?.[0]).toMatchObject({
      target: 'primary',
      multipliers: ['3']
    });
    expect(get('2004010', '200401003')?.damage?.[0]).toMatchObject({
      target: 'all',
      multipliers: ['2.5']
    });
    expect(get('2012010', '201201002')?.damage?.[0]).toMatchObject({
      target: 'enemy-side',
      multipliers: ['0.4']
    });
    expect(get('4013010', '401301001')?.damage?.[0]).toMatchObject({
      target: 'each-swept',
      multipliers: ['2.8']
    });
    expect(get('4064012', '406401207')?.damage).toEqual([
      { target: 'other-marked', multipliers: ['4'], scaling: 'attack' },
      { target: 'marked', multipliers: ['12'], scaling: 'attack' }
    ]);
    expect(get('4064012', '406401204')?.damage?.[0].multipliers).toEqual(['6', '42']);
    expect(get('2004010', '200401002')?.damage).toEqual([
      { target: 'primary', multipliers: ['9'], scaling: 'attack' },
      { target: 'adjacent', multipliers: ['2'], scaling: 'attack' }
    ]);
    expect(get('4064012', '406401205')?.damage).toEqual([
      { target: 'all', multipliers: ['10.5'], scaling: 'attack' }
    ]);
    expect(JSON.stringify(get('1022010', '102201001'))).not.toContain('toughness');
  });

  it.each([
    ['4014018', '401401803', ['1.8', '3.6']],
    ['4014018', '401401805', ['1.4', '2.8']],
    ['4014018', '401401809', ['0.4', '0.8']],
    ['4014018', '401401801', ['1.2', '2.4']],
    ['4014018', '401401806', ['8.0', '16.0']],
    ['2034010', '203401001', ['2']],
    ['4014012', '401401201', ['2.2']]
  ])('collects real conditional/callback values for %s/%s', (monsterId, skillId, expected) => {
    expect(get(monsterId, skillId)?.damage?.[0].multipliers).toEqual(expected);
  });

  it('retains the four retargeted values in an unlabelled group', () => {
    expect(get('4014018', '401401802')?.damage).toEqual([
      { multipliers: ['0.9', '1.1', '1.8', '2.2'], scaling: 'attack' }
    ]);
  });

  it('retains the real loop-contained value without inventing repetition', () => {
    expect(get('8003050', '800305004')?.damage).toEqual([
      { target: 'primary', multipliers: ['4.5'], scaling: 'attack' }
    ]);
  });

  it('publishes numeric applications with optional status identity', () => {
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
    expect(get('2004010', '200401004')?.applications).toEqual([
      { target: 'primary', baseChance: '1.2' }
    ]);
    expect(get('2004010', '200401001')?.applications).toEqual([
      { target: 'primary', baseChance: '1' }
    ]);
    expect(get('3003013', '300301301')?.applications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ baseChance: '0.8' }),
        expect.objectContaining({ baseChance: '0.5' })
      ])
    );
  });

  it('keeps action shifts and omits skills without supported numeric facts', () => {
    expect(get('1022010', '102201001')?.actionShifts).toEqual([{ kind: 'delay', ratio: '0.5' }]);
    expect(get('2004010', '200401004')?.actionShifts).toEqual([{ kind: 'advance', ratio: '1' }]);
    expect(get('3003051', '300305105')).toBeUndefined();
    expect(get('4013010', '401301005')).toBeUndefined();
    expect(get('4064012', '406401202')).toBeUndefined();
    expect(get('4064012', '406401201')?.applications).toBeUndefined();
  });

  it('omits bounce values whose numeric source is unresolved', () => {
    expect(get('4014012', '401401207')).toBeUndefined();
    expect(get('4014012', '401401208')).toBeUndefined();
  });
});
