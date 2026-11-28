import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildEndgameDomain, type EndgameDomain } from '../../scripts/data/endgame.js';
import {
  resolveSummonContext,
  directSummonIds,
  selectSummonStats,
  type SummonTaskEvidence
} from '../../scripts/data/endgame-summons.js';
import { resolveEndgameHpBase } from '../../scripts/data/enemy-stats.js';
import { canonicalDecimal } from '../../scripts/data/decimal.js';
import { assertDataRoot } from '../../scripts/data/paths.js';
import { assertSummonArtifacts } from '../../scripts/data/validation/endgame-summons.js';
import { buildGroupView } from '../../src/lib/domain/endgame-view.js';

const task = (changes: Partial<SummonTaskEvidence['tasks'][number]> = {}) => ({
  file: 'fixture.json',
  name: 'Spawn',
  inherited: [],
  unknownCreation: false,
  targetId: 2,
  ...changes
});

describe('MoC summon policy', () => {
  it('preserves concrete declarations, deduplicates and diagnoses invalid and unverified self references', () => {
    const warn = vi.fn();
    expect(directSummonIds([3, 2, 3, 4, 1, 0], 1, { tasks: [] }, (id) => id <= 3, warn)).toEqual([
      3, 2
    ]);
    expect(warn.mock.calls).toEqual([
      ['invalid-summon-target', 4],
      ['unverified-summon-self-reference', 1],
      ['invalid-summon-target', 0]
    ]);
    expect(
      directSummonIds([1, 1], 1, { tasks: [task({ targetId: 1 })] }, () => true, warn)
    ).toEqual([1]);
  });

  it('handles constant, conflicting and dynamically bound elite overrides', () => {
    const resolve = (tasks: SummonTaskEvidence['tasks']) =>
      resolveSummonContext(1, 2, 10, 'stage', 15, { tasks });
    expect(resolve([task({ eliteOverride: 20 })])).toMatchObject({
      eliteSelection: 'task-override',
      eliteGroupIds: [20]
    });
    expect(resolve([task({ eliteOverride: 20 }), task()])).toMatchObject({
      eliteSelection: 'compare-candidates',
      eliteGroupIds: [20, 10]
    });
    expect(resolve([task({ targetId: undefined, eliteOverride: 20 })]).unresolved.get('hp')).toBe(
      'dynamic-summon-task'
    );
    expect(resolve([task({ eliteOverride: 'dynamic' })]).unresolved.size).toBe(3);
    expect(resolve([task({ unknownCreation: true })]).unresolved.size).toBe(3);
    expect(resolve([task({ inherited: ['hp'] })]).unresolved.size).toBe(1);
  });

  it('compares fallback groups independently for HP, Speed and Stance', () => {
    const policy = resolveSummonContext(1, 2, 10, 'monster-fallback', 20, { tasks: [] });
    expect(policy.eliteGroupIds).toEqual([10, 20]);
    const unavailable = { status: 'unavailable' as const, reason: 'missing-base' as const };
    const candidate = (ratio: string) => ({
      hp: resolveEndgameHpBase({ Value: '2' }, { Value: '3' }, { Value: '4' }, { Value: ratio }),
      speed: unavailable,
      toughness: {
        internalStance: unavailable,
        display: unavailable,
        runtimeStatus: 'static' as const
      }
    });
    const different = selectSummonStats(policy, [candidate('1'), candidate('2')]);
    expect(different.hp).toEqual({ status: 'unresolved', reason: 'ambiguous-elite-context' });
    expect(different.speed).toEqual(unavailable);
    expect(different.toughness.display).toEqual(unavailable);
    expect(selectSummonStats(policy, [candidate('1'), candidate('1.0')]).hp.status).toBe(
      'configured'
    );
  });
});

describe('MoC summon pinned data', () => {
  let domain: EndgameDomain;
  beforeAll(async () => {
    domain = await buildEndgameDomain(assertDataRoot());
  }, 30000);

  function owner(groupId: number, stageId: number, monsterId: number) {
    const group = domain.datasets.moc.groups.find((entry) => entry.groupId === groupId)!;
    const stage = group.encounters
      .flatMap((entry) => entry.battles.flatMap((battle) => battle.stages))
      .find((entry) => entry.stageId === stageId)!;
    if (stage.waveModel.kind !== 'fixed') throw new Error('Unexpected wave model');
    return stage.waveModel.waves
      .flatMap((wave) => wave.enemies)
      .find((enemy) => enemy.monsterId === monsterId)!;
  }

  it('reconstructs the benchmark and the same concrete target in a different stage', () => {
    const group = domain.datasets.moc.groups.find((entry) => entry.groupId === 1036)!;
    const encounter = group.encounters.find((entry) => entry.configId === 5512)!;
    const stage = encounter.battles.find((entry) => entry.slot === 3)!.stages[0];
    expect(stage.stageId).toBe(30126123);
    if (stage.waveModel.kind !== 'fixed') throw new Error('Unexpected wave model');
    const wave = stage.waveModel.waves[1];
    expect(wave.enemies.map((enemy) => enemy.monsterId)).toEqual([4064010]);
    const target = wave.enemies[0].summonTargets![0];
    expect(target).toMatchObject({
      monsterId: 4062010,
      voracityLevel: 3,
      context: { level: 95, hardLevelGroup: 3, eliteGroupIds: [168], confidence: 'inferred' },
      hp: {
        status: 'configured',
        factors: {
          hpBase: '232.5',
          instanceRatio: '1',
          levelRatio: '375.4385',
          eliteRatio: '7.7',
          baseEncounterMaxHpPerBar: '672128.774625'
        }
      },
      speed: { configuredValue: '132.00' },
      toughness: { internalStance: { resolvedInternal: '90' }, display: { perBar: '30' } }
    });
    expect(target).not.toHaveProperty('summonTargets');
    const earlier = owner(1027, 30117122, 4064010).summonTargets![0];
    expect(earlier.monsterId).toBe(4062010);
    if (earlier.hp.status !== 'configured') throw new Error('Expected configured HP');
    expect(canonicalDecimal(earlier.hp.factors.baseEncounterMaxHpPerBar)).toBe('279326.244');
    const view = buildGroupView(group, [], new Map());
    const card = view.encounters
      .find((entry) => entry.id === '5512')!
      .battles.find((entry) => entry.slot === 3)!.stages[0].waves[1].enemies[0];
    expect(card.summonTargets?.[0].enemy).toMatchObject({
      hp: { roundedPerBar: '672,129' },
      speed: { rounded: '132' },
      toughness: { roundedPerBar: '30' }
    });
  });

  it('separates shared and inherited HP from other attributes and limits self-reference to one layer', () => {
    const shared = owner(1029, 30119111, 3004012).summonTargets!;
    expect(shared.map((entry) => entry.monsterId)).toEqual([3003031, 3003041, 3003051]);
    expect(
      shared.every((entry) => entry.hp.status === 'shared' && entry.speed.status === 'resolved')
    ).toBe(true);
    expect(owner(113, 30007211, 2022050).summonTargets?.[0]).toMatchObject({
      monsterId: 2022051,
      hp: { status: 'unresolved', reason: 'runtime-inheritance' },
      speed: { status: 'resolved' },
      toughness: { display: { status: 'resolved' } }
    });
    expect(owner(1011, 30101022, 8022010).summonTargets?.map((entry) => entry.monsterId)).toEqual([
      8022010
    ]);
    expect(owner(1026, 30116121, 100402016).summonTargets).toBeUndefined();
    expect(domain.audit.summons.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unverified-summon-self-reference', ownerId: 100402016 })
    );
    expect(domain.audit.summary.modes.moc.occurrences).toBe(7409);
  });

  it('requires concrete shared-group membership and preserves separately declared variants', () => {
    const pollux = owner(1023, 30113121, 4014030).summonTargets!;
    expect(pollux.map(({ monsterId, hp }) => [monsterId, hp.status])).toEqual([
      [4012070, 'shared'],
      [4012071, 'shared']
    ]);
    const host = owner(1030, 30120121, 5014010).summonTargets!;
    const variants = host.filter(({ monsterId }) => [501203102, 501203103].includes(monsterId));
    expect(variants).toHaveLength(2);
    expect(new Set(variants.map(({ monsterTemplateId }) => monsterTemplateId)).size).toBe(1);
    expect(
      variants.every(
        ({ hp }) => hp.status === 'unresolved' && hp.reason === 'unresolved-shared-membership'
      )
    ).toBe(true);
  });

  it('rejects recursive targets at the locale artifact boundary', () => {
    const group = structuredClone(
      domain.datasets.moc.groups.find(({ groupId }) => groupId === 1036)!
    );
    const dataset = { ...domain.datasets.moc, groups: [group] };
    for (const encounter of group.encounters)
      for (const battle of encounter.battles)
        for (const stage of battle.stages)
          if (stage.waveModel.kind === 'fixed')
            for (const wave of stage.waveModel.waves)
              for (const enemy of wave.enemies)
                for (const target of enemy.summonTargets ?? [])
                  target.name = String(target.monsterId);
    const nameFor = (target: { monsterId: number }) => String(target.monsterId);
    expect(() => assertSummonArtifacts(dataset, nameFor)).not.toThrow();
    const stage = group.encounters
      .find(({ id }) => id === '5512')!
      .battles.find(({ slot }) => slot === 3)!.stages[0];
    if (stage.waveModel.kind !== 'fixed') throw new Error('Unexpected wave model');
    Object.assign(stage.waveModel.waves[1].enemies[0].summonTargets![0], { summonTargets: [] });
    expect(() => assertSummonArtifacts(dataset, nameFor)).toThrow(/declaration order/);
  });
});
