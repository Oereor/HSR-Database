import { describe, expect, it } from 'vitest';
import {
  activateTrace,
  calculateCharacterTrainingTarget,
  createDefaultCharacterTrainingTarget,
  createInitialCharacterTrainingTarget,
  deactivateTrace,
  derivePromotion,
  mergeCosts,
  progressionKey,
  reconcileCharacterLevel,
  resolveSkillTraining,
  validateTrainingProfile
} from '../../src/lib/domain/training/index';
import type {
  Cost,
  PromotionCostStage,
  TrainingStep,
  CharacterTrainingData,
  CharacterTrainingProfile,
  TrainingNode,
  TrainingSharedData
} from '../../src/lib/domain/training/types';

const promotions = [20, 30, 40, 50, 60, 70, 80].map<PromotionCostStage>((maxLevel, promotion) => ({
  promotion,
  maxLevel,
  cost: promotion === 6 ? ({} as Cost) : { '2': (promotion + 1) * 100 }
}));
const skill: TrainingNode = {
  key: progressionKey('1', 0, '10'),
  pointId: '10',
  pointType: 2,
  kind: 'skill',
  defaultUnlock: true,
  maxLevel: 10,
  prerequisiteIds: [],
  linkedSkillIds: ['101', '102', '103'],
  bindings: ['101', '102'].map((skillId) => ({
    skillId,
    category: skillId === '101' ? 'talent' : 'assist',
    source: 'avatar',
    displayLevels: Array.from({ length: 15 }, (_, i) => i + 1)
  })),
  steps: Array.from({ length: 10 }, (_, i): TrainingStep => ({
    level: i + 1,
    requiredPromotion: [0, 1, 2, 3, 4, 4, 5, 5, 6, 6][i],
    cost: i === 0 ? {} : { '2': i * 10 }
  }))
};
const trace = (
  pointId: string,
  prerequisiteIds: string[] = [],
  requiredPromotion = 0
): TrainingNode => ({
  key: progressionKey('1', 0, pointId),
  pointId,
  pointType: 1,
  kind: 'trace',
  defaultUnlock: false,
  maxLevel: 1,
  prerequisiteIds,
  linkedSkillIds: [],
  bindings: [],
  steps: [{ level: 1, requiredPromotion, cost: { '2': 1 } }]
});
const profile: CharacterTrainingProfile = {
  avatarId: '1',
  enhancedId: 0,
  nodes: [
    skill,
    trace('20'),
    trace('21', ['20']),
    trace('22', ['20'], 4),
    trace('23', ['21', '22'], 6),
    trace('24')
  ]
};
const data: CharacterTrainingData = {
  schemaVersion: 1,
  avatarId: '1',
  expGroup: '1',
  promotions,
  profiles: [profile]
};
const shared: TrainingSharedData = {
  schemaVersion: 1,
  characterExp: { '1': Array.from({ length: 79 }, () => 10) },
  lightConeExp: {},
  materials: [],
  characterExpItems: [{ itemId: '211', exp: 10 }],
  lightConeExpItems: [{ itemId: '221', exp: 10, creditCost: 5 }],
  characterExpCreditDivisor: 10
};

describe('training core', () => {
  it('derives lower promotion at boundaries and rejects malformed chains/levels', () => {
    expect(
      [1, 20, 21, 30, 31, 70, 71, 80].map((level) => derivePromotion(promotions, level))
    ).toEqual([0, 0, 1, 1, 2, 5, 6, 6]);
    for (const level of [0, 81, 1.5, NaN, Infinity])
      expect(() => derivePromotion(promotions, level)).toThrow();
    expect(() => derivePromotion([], 1)).toThrow();
    expect(() => derivePromotion(promotions.slice(1), 21)).toThrow();
    expect(() =>
      derivePromotion([{ ...promotions[0], maxLevel: 30 }, ...promotions.slice(1)], 1)
    ).toThrow();
  });

  it('keeps EXP separate and charges outgoing promotion steps, with a zero initial target', () => {
    const initial = calculateCharacterTrainingTarget(
      data,
      shared,
      createInitialCharacterTrainingTarget(data, 0)
    );
    expect(initial.requiredExp).toBe(0);
    expect(initial.totalKnownCost).toEqual({});
    const result = calculateCharacterTrainingTarget(data, shared, {
      avatarId: '1',
      enhancedId: 0,
      level: 31
    });
    expect(result.requiredExp).toBe(300);
    expect(result.promotionCost).toEqual({ '2': 300 });
    expect(result.totalKnownCost).toEqual(result.promotionCost);
    expect(() =>
      calculateCharacterTrainingTarget(
        data,
        { ...shared, characterExp: { '1': [10] } },
        { avatarId: '1', enhancedId: 0, level: 31 }
      )
    ).toThrow();
  });

  it('clamps paid level, preserves preview, and recovers training after promotion increases', () => {
    expect(resolveSkillTraining(skill, 5, 6).trainingLevel).toBe(5);
    expect(resolveSkillTraining(skill, 12, 6)).toMatchObject({
      displayLevel: 12,
      paidMaxLevel: 10,
      trainingLevel: 10,
      requiredPromotion: 6
    });
    expect(resolveSkillTraining(skill, 12, 4).trainingLevel).toBe(6);
    const target = {
      avatarId: '1',
      enhancedId: 0,
      level: 80,
      displayLevels: { [skill.key]: 12 },
      activeTraceIds: ['20', '21', '22', '23', '24']
    };
    const lowered = reconcileCharacterLevel(data, target, 60);
    expect(lowered.displayLevels).toEqual(target.displayLevels);
    expect(lowered.activeTraceIds).toEqual(['20', '21', '22', '24']);
    expect(calculateCharacterTrainingTarget(data, shared, lowered).skills[0].trainingLevel).toBe(6);
    const raised = reconcileCharacterLevel(data, lowered, 80);
    expect(raised.activeTraceIds).toEqual(lowered.activeTraceIds);
    expect(calculateCharacterTrainingTarget(data, shared, raised).skills[0].trainingLevel).toBe(10);
    expect(target.activeTraceIds).toContain('23');
    expect(() => resolveSkillTraining(skill, 16, 6)).toThrow();
  });

  it('charges one canonical node for shared public and hidden skills', () => {
    const result = calculateCharacterTrainingTarget(
      data,
      shared,
      createDefaultCharacterTrainingTarget(data, 0)
    );
    expect(result.skillCost).toEqual({ '2': 450 });
    expect(result.skills).toHaveLength(1);
    expect(result.target.displayLevels).toEqual({ [skill.key]: 10 });
  });

  it('activates ancestors atomically and removes every dependent branch', () => {
    expect(activateTrace(profile, ['24'], '23', 6)).toEqual({
      ok: true,
      activeTraceIds: ['20', '21', '22', '23', '24']
    });
    expect(activateTrace(profile, ['24'], '23', 4)).toMatchObject({
      ok: false,
      activeTraceIds: ['24'],
      error: { code: 'promotion-required', pointIds: ['23'] }
    });
    expect(deactivateTrace(profile, ['20', '21', '22', '23', '24'], '20')).toEqual(['24']);
    expect(deactivateTrace(profile, ['20', '21', '22', '23', '24'], '21')).toEqual([
      '20',
      '22',
      '24'
    ]);
    expect(() =>
      calculateCharacterTrainingTarget(data, shared, {
        avatarId: '1',
        enhancedId: 0,
        level: 80,
        activeTraceIds: ['23']
      })
    ).toThrow();
  });

  it('checks ancestor promotion and refuses external fixed prerequisites without partial activation', () => {
    const lowerTarget = {
      ...profile,
      nodes: profile.nodes.map((node) =>
        node.pointId === '23'
          ? { ...node, steps: [{ ...node.steps[0], requiredPromotion: 0 }] }
          : node
      )
    };
    expect(activateTrace(lowerTarget, ['24'], '23', 3)).toMatchObject({
      ok: false,
      activeTraceIds: ['24'],
      error: { pointIds: ['22'] }
    });
    const fixed: TrainingNode = {
      ...trace('30'),
      kind: 'fixed',
      steps: [{ level: 1, requiredPromotion: 0, cost: {} }]
    };
    const graph = { ...profile, nodes: [...profile.nodes, fixed, trace('31', ['30'])] };
    expect(activateTrace(graph, [], '31', 6)).toMatchObject({
      ok: false,
      activeTraceIds: [],
      error: { code: 'non-activatable-prerequisite', pointIds: ['30'] }
    });
    expect(() => activateTrace(graph, [], '30', 6)).toThrow();
    expect(() => createDefaultCharacterTrainingTarget({ ...data, profiles: [graph] }, 0)).toThrow();
  });

  it('rejects duplicate, dangling, self and cyclic relationships, and profile mismatches', () => {
    for (const nodes of [
      [trace('20'), trace('20')],
      [trace('20', ['99'])],
      [trace('20', ['20'])],
      [trace('20', ['21']), trace('21', ['20'])]
    ]) {
      expect(() => validateTrainingProfile({ ...profile, nodes })).toThrow();
    }
    for (const target of [
      { avatarId: '2', enhancedId: 0, level: 1 },
      { avatarId: '1', enhancedId: 1, level: 1 },
      { avatarId: '1', enhancedId: 0, level: 1, displayLevels: { '101': 5 } },
      { avatarId: '1', enhancedId: 0, level: 1, activeTraceIds: ['10'] },
      { avatarId: '1', enhancedId: 0, level: 1, activeTraceIds: ['20', '20'] }
    ])
      expect(() => calculateCharacterTrainingTarget(data, shared, target)).toThrow();
  });

  it('validates exact integers and rejects sum overflow', () => {
    expect(mergeCosts({ '2': 0 }, { '2': 3 }, { '2': 2, '11': 1 })).toEqual({ '2': 5, '11': 1 });
    for (const cost of [{ '2': -1 }, { '2': 1.5 }, { '2': NaN }, { invalid: 1 }] as Cost[])
      expect(() => mergeCosts(cost)).toThrow();
    expect(() => mergeCosts({ '2': Number.MAX_SAFE_INTEGER }, { '2': 1 })).toThrow();
  });
});
