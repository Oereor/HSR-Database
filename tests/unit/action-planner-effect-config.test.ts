import { describe, expect, it } from 'vitest';
import {
  moveOperation,
  saveOperation,
  targetIds
} from '../../src/lib/action-planner/effect-config';
import { simulatePlan } from '../../src/lib/action-planner/engine';
import type {
  EffectOperation,
  EventAnchor,
  SimulationPlan
} from '../../src/lib/action-planner/types';

const anchor: EventAnchor = { kind: 'action', participantId: 'a', turn: 1 };
const operations: EffectOperation[] = [
  {
    id: 'b',
    type: 'advance',
    target: { kind: 'participants', participantIds: ['b'] },
    percent: 100,
    phase: 'preAction'
  },
  {
    id: 'post',
    type: 'advance',
    target: { kind: 'participants', participantIds: ['a'] },
    percent: 24,
    phase: 'postAction'
  },
  {
    id: 'c',
    phase: 'preAction',
    type: 'advance',
    target: { kind: 'participants', participantIds: ['c'] },
    percent: 100
  }
];
const plan: SimulationPlan = {
  actors: ['a', 'b', 'c'].map((id, position) => ({
    id,
    name: id,
    kind: 'actor',
    camp: 'ally',
    position,
    baseSpeed: 100,
    panelSpeed: 160 - position * 20
  })),
  events: [{ anchor, operations }],
  maxNodes: 4,
  maxAV: 600
};

describe('effect configuration replay', () => {
  it('reorders inside a window and changes actual zero-queue priority', () => {
    expect(simulatePlan(plan).records[1].anchor.participantId).toBe('c');
    const moved = moveOperation(operations, 'c', -1, anchor);
    expect(moved.map((operation) => operation.id)).toEqual(['c', 'post', 'b']);
    expect(
      simulatePlan({ ...plan, events: [{ anchor, operations: moved }] }).records[1].anchor
        .participantId
    ).toBe('b');
    expect(moveOperation(operations, 'b', -1, anchor)).toEqual(operations);
    expect(moveOperation(operations, 'post', 1, anchor)).toEqual(operations);
  });
  it('edits in place, appends on phase change and replays deletion of original speed additions', () => {
    const changed = saveOperation(
      operations,
      {
        ...operations[0],
        type: 'advance',
        target: { kind: 'participants', participantIds: ['b'] },
        percent: 25
      },
      anchor
    );
    expect(changed.map((operation) => operation.id)).toEqual(['b', 'post', 'c']);
    const migrated = saveOperation(operations, { ...operations[0], phase: 'postAction' }, anchor);
    expect(migrated.map((operation) => operation.id)).toEqual(['post', 'c', 'b']);
    const speed: EffectOperation = {
      id: 'speed',
      type: 'addSpeedModifier',
      target: { kind: 'participants', participantIds: ['a'] },
      mode: 'flat',
      amount: 40,
      duration: { kind: 'turns', turns: null }
    };
    const added = saveOperation([], speed, { kind: 'start' });
    const withSpeed = {
      ...plan,
      events: [{ anchor: { kind: 'start' as const }, operations: added }]
    };
    expect(simulatePlan(withSpeed).records[0].elapsedAV).toBe(50);
    expect(simulatePlan({ ...withSpeed, events: [] }).records[0].elapsedAV).toBe(62.5);
    expect(operations[0]).toMatchObject({ percent: 100 });
  });
  it('expands old camp targets into stable explicit instance IDs without splitting operations', () => {
    expect(targetIds({ kind: 'allies' }, plan.actors)).toEqual(['a', 'b', 'c']);
    expect(targetIds({ kind: 'participants', participantIds: ['c', 'b'] }, plan.actors)).toEqual([
      'c',
      'b'
    ]);
    const group = saveOperation(
      [],
      {
        id: 'group',
        phase: 'preAction',
        type: 'advance',
        target: { kind: 'participants', participantIds: ['c', 'b'] },
        percent: 100
      },
      anchor
    );
    expect(group).toHaveLength(1);
    expect(
      simulatePlan({ ...plan, events: [{ anchor, operations: group }] })
        .records.slice(1, 3)
        .map((record) => record.anchor.participantId)
    ).toEqual(['b', 'c']);
  });
});
