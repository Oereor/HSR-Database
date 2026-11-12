import { describe, expect, it } from 'vitest';
import { calculatePhaseHp, parseEnemyPhaseRatios } from '../../scripts/data/enemy-phase-hp';
import { effectiveSkillParams, normalizedActionShift } from '../../scripts/data/enemy-skill-params';
import { parseDecimal } from '../../scripts/data/decimal';
import { buildEndgameDomain } from '../../scripts/data/endgame';
import { readTable } from '../../scripts/data/raw';
import { buildOccurrenceView } from '../../src/lib/domain/endgame-view';

const dynamic = (op = 'AQAR') => ({
  IsDynamic: true,
  PostfixExpr: {
    OpCodes: op,
    DynamicHashes: [7],
    FixedValues: op === 'AQAAAAQR' ? [{ Value: '0.5' }] : []
  }
});
const skill = { SkillID: 1, SkillTriggerKey: 'Skill01', ParamList: [{ Value: '1.25' }] };
const skills = new Map([['1', skill]]);
const monster = {
  SkillList: [1],
  OverrideSkillParams: [{ BOKJJKFCFME: 1, PBLPLDJKPEI: [{ Value: '-1' }] }]
};
const character = (value: unknown) => ({
  MaxMonsterPhase: 2,
  PhaseList: [{ PhaseNum: 1 }, { PhaseNum: 2, PhaseMaxHPRatio: value }],
  DynamicValues: {
    Floats: { '7': { ReadInfo: { Type: 'SkillParam', TriggerKey: 'Skill01', Index: 0 } } }
  }
});

describe('static phase HP', () => {
  it('separates missing metadata, default ratios, fixed values and explicitly invalid values', () => {
    expect(parseEnemyPhaseRatios(undefined, monster, skills)).toBeUndefined();
    expect(parseEnemyPhaseRatios({}, monster, skills)?.[0].ratio).toEqual({
      status: 'default',
      value: '1'
    });
    expect(
      parseEnemyPhaseRatios(
        character({ IsDynamic: false, FixedValue: { Value: '1.4' } }),
        monster,
        skills
      )?.[1].ratio
    ).toEqual({ status: 'resolved', value: '1.4' });
    for (const value of [
      null,
      {},
      dynamic('unknown'),
      { IsDynamic: false, FixedValue: { Value: '-1' } }
    ]) {
      const phases = parseEnemyPhaseRatios(character(value), monster, skills)!;
      expect(phases.map((p) => p.ratio.status)).toEqual(['default', 'unresolved']);
    }
  });
  it('inherits only referenced -1 phase HP parameters and supports the shared multiply expression', () => {
    expect(parseEnemyPhaseRatios(character(dynamic()), monster, skills)?.[1].ratio).toEqual({
      status: 'resolved',
      value: '1.25'
    });
    expect(
      parseEnemyPhaseRatios(character(dynamic('AQAAAAQR')), monster, skills)?.[1].ratio
    ).toEqual({ status: 'resolved', value: '0.625' });
    expect(effectiveSkillParams(skill, monster)).toEqual(['-1']);
    expect(normalizedActionShift(effectiveSkillParams(skill, monster)[0]!)).toEqual({
      kind: 'advance',
      ratio: '1'
    });
    const invalidBase = new Map([['1', { ...skill, ParamList: [{ Value: '0' }] }]]);
    expect(
      parseEnemyPhaseRatios(character(dynamic()), monster, invalidBase)?.[1].ratio.status
    ).toBe('unresolved');
    const override = {
      ...monster,
      OverrideSkillParams: [{ BOKJJKFCFME: 1, PBLPLDJKPEI: [{ Value: '2' }] }]
    };
    expect(parseEnemyPhaseRatios(character(dynamic()), override, skills)?.[1].ratio).toEqual({
      status: 'resolved',
      value: '2'
    });
  });
  it('rejects duplicate overrides, conflicting triggers, invalid reads and structural gaps locally', () => {
    expect(
      parseEnemyPhaseRatios(
        character(dynamic()),
        {
          ...monster,
          OverrideSkillParams: [...monster.OverrideSkillParams, ...monster.OverrideSkillParams]
        },
        skills
      )?.[1].ratio.status
    ).toBe('unresolved');
    const conflicting = new Map([
      ...skills,
      ['2', { ...skill, SkillID: 2, ParamList: [{ Value: '2' }] }]
    ]);
    expect(
      parseEnemyPhaseRatios(
        character(dynamic()),
        { ...monster, SkillList: [1, 2] },
        conflicting
      )?.[1].ratio.status
    ).toBe('unresolved');
    const missing = character(dynamic());
    missing.DynamicValues.Floats['7'].ReadInfo.Index = 99;
    expect(parseEnemyPhaseRatios(missing, monster, skills)?.[1].ratio.status).toBe('unresolved');
    const duplicate = {
      ...character(dynamic()),
      PhaseList: [{ PhaseNum: 1 }, { PhaseNum: 2 }, { PhaseNum: 2 }]
    };
    expect(parseEnemyPhaseRatios(duplicate, monster, skills)?.map((p) => p.ratio.status)).toEqual([
      'default',
      'unresolved'
    ]);
    expect(
      parseEnemyPhaseRatios(
        { MaxMonsterPhase: 2, PhaseList: [{ PhaseNum: 1 }] },
        monster,
        skills
      )?.[1].ratio.status
    ).toBe('unresolved');
  });
  it('multiplies the already resolved encounter HP without further intermediate rounding', () => {
    const phases = parseEnemyPhaseRatios(character(dynamic()), monster, skills)!;
    expect(
      calculatePhaseHp(phases, {
        status: 'resolved',
        maxHpPerBar: parseDecimal('100.5'),
        source: 'base-encounter',
        rounding: 'display-half-up'
      })[1].maxHp
    ).toBe('125.625');
    expect(
      calculatePhaseHp(phases, {
        status: 'unresolved',
        reason: 'invalid-pf-wave-param-count'
      }).every((p) => p.maxHp === undefined)
    ).toBe(true);
  });
  it('resolves both Iron Tomb encounters and preserves shared action shifts', async () => {
    const root = process.env.HSR_DATA_ROOT ?? '../TurnBasedGameData';
    const { datasets } = await buildEndgameDomain(root);
    const all: import('../../src/lib/domain/endgame').EnemyOccurrence[] = [];
    for (const dataset of Object.values(datasets))
      for (const group of dataset.groups)
        for (const encounter of group.encounters)
          for (const battle of encounter.battles)
            for (const stage of battle.stages)
              for (const wave of stage.waveModel.waves)
                all.push(
                  ...('enemies' in wave
                    ? wave.enemies
                    : wave.monsterGroups.flatMap(
                        (g: import('../../src/lib/domain/endgame').SpawnMonsterGroup) =>
                          g.orderedEnemies
                      ))
                );
    const iron = all.filter((o) => o.monsterId === 403501001);
    expect(iron).toHaveLength(2);
    expect(
      iron.map((o) =>
        o.hp.phases?.map((p) => (p.ratio.status !== 'unresolved' ? p.ratio.value : undefined))
      )
    ).toEqual([
      ['1', '1.25', '1'],
      ['1', '1.25', '1']
    ]);
    expect(iron.map((o) => buildOccurrenceView(o).hp.phases?.map((p) => p.rounded))).toEqual([
      ['12,395,970', '15,494,962', '12,395,970'],
      ['49,583,878', '61,979,848', '49,583,878']
    ]);
    const monsters = await readTable<any>(root, 'MonsterConfig'),
      rows = await readTable<any>(root, 'MonsterSkillConfig');
    const part = monsters.find((m) => m.MonsterID === 403206001),
      row = rows.find((s) => s.SkillID === 403206001);
    expect(normalizedActionShift(effectiveSkillParams(row, part)[1]!)).toEqual({
      kind: 'advance',
      ratio: '1'
    });
  }, 30000);
});
