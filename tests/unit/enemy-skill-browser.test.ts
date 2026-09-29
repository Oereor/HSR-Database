import { describe, expect, it } from 'vitest';
import { parseDecimal } from '../../scripts/data/decimal';
import type { EnemySkillPhaseView, EnemySkillView } from '../../src/lib/domain/enemy-view';
import {
  enemySkillsInPhase,
  resolveEnemySkillSelection
} from '../../src/lib/domain/enemy-skill-browser';
import {
  formatEnemySkillPercent,
  formatEnemySkillTotals,
  visibleEnemySkillApplications
} from '../../src/lib/domain/enemy-skill-format';

const skill = (id: string): EnemySkillView => ({ id }) as EnemySkillView;
const phase = (index: number, ids: string[]): EnemySkillPhaseView => ({
  index,
  skills: ids.map((id) => ({ id })) as EnemySkillPhaseView['skills']
});

describe('Enemy Skill Browser state and formatting', () => {
  it('formats one or several proven damage totals without numeric rounding', () => {
    expect(formatEnemySkillTotals(['3'])).toBe('300%');
    expect(formatEnemySkillTotals(['3', '5'])).toBe('300% / 500%');
  });
  it('collapses a shared chance and hides unexplained different chances', () => {
    const chance = parseDecimal;
    expect(
      visibleEnemySkillApplications([
        { statusId: 'a', name: 'A', baseChance: chance('1') },
        { statusId: 'b', name: 'B', baseChance: chance('1.0') }
      ])
    ).toEqual([{ baseChance: '1' }]);
    expect(
      visibleEnemySkillApplications([
        { baseChance: chance('0.5'), target: 'primary' },
        { baseChance: chance('0.8'), target: 'primary' }
      ])
    ).toEqual([]);
    expect(
      visibleEnemySkillApplications([
        { statusId: 'a', name: 'A', baseChance: chance('0.5'), target: 'primary' },
        { baseChance: chance('0.8'), target: 'primary' },
        { baseChance: chance('0.7'), target: 'adjacent' }
      ])
    ).toEqual([
      { statusId: 'a', name: 'A', baseChance: '0.5', target: 'primary' },
      { baseChance: '0.7', target: 'adjacent' }
    ]);
  });
  it('keeps concrete skill order while filtering by phase', () => {
    const skills = [skill('c'), skill('a'), skill('b')];
    expect(enemySkillsInPhase(skills, phase(2, ['a', 'c'])).map((entry) => entry.id)).toEqual([
      'c',
      'a'
    ]);
  });

  it('preserves a shared skill and moves to its available phase on Monster change', () => {
    const selection = resolveEnemySkillSelection(
      [skill('a'), skill('b')],
      [phase(1, ['a']), phase(2, ['b'])],
      1,
      'b'
    );
    expect(selection).toEqual({ phaseIndex: 2, skillId: 'b' });
  });

  it('falls back to the first available skill when the old Monster skill is absent', () => {
    expect(
      resolveEnemySkillSelection(
        [skill('a'), skill('b')],
        [phase(1, []), phase(2, ['b', 'a'])],
        1,
        'old'
      )
    ).toEqual({ phaseIndex: 2, skillId: 'a' });
    expect(resolveEnemySkillSelection([], [], undefined, 'old')).toEqual({
      phaseIndex: undefined,
      skillId: undefined
    });
  });

  it.each([
    ['3', '300%'],
    ['1.3', '130%'],
    ['0.4', '40%'],
    ['1.2', '120%'],
    ['0.5', '50%'],
    ['1', '100%'],
    ['1.2345', '123.45%'],
    ['0.0001', '0.01%']
  ])('formats %s exactly as %s', (ratio, expected) => {
    expect(formatEnemySkillPercent(ratio)).toBe(expected);
  });
});
