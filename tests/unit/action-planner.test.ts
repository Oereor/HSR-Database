import { describe, expect, it } from 'vitest';
import {
  anchorKey,
  applyOperations,
  createInitialState,
  modifierId,
  simulatePlan,
  stepSimulation
} from '../../src/lib/action-planner/engine';
import type {
  EffectOperation,
  EventAnchor,
  SimulationPlan,
  Target,
  UnitConfig
} from '../../src/lib/action-planner/types';

const target = (...unitIds: string[]): Target => ({ kind: 'units', unitIds });
const unit = (id: string, speed: number, position = 0): UnitConfig => ({
  id,
  name: id,
  camp: 'ally',
  position,
  baseSpeed: 100,
  panelSpeed: speed
});
const advance = (id: string, ids: string[], percent = 100): EffectOperation => ({
  id,
  type: 'advance',
  target: target(...ids),
  percent
});
const buff = (id: string, unitId: string, turns: number, amount = 50): EffectOperation => ({
  id,
  type: 'addSpeedModifier',
  target: target(unitId),
  mode: 'flat',
  amount,
  turns
});
const action = (unitId: string, turn = 1): EventAnchor => ({ kind: 'action', unitId, turn });
const start: EventAnchor = { kind: 'start' };
const plan = (operations: EffectOperation[] = []): SimulationPlan => ({
  units: [unit('a', 160), unit('b', 134, 1)],
  events: [{ anchor: start, operations }],
  maxActions: 12,
  maxAV: 600
});
const order = (operations: EffectOperation[]) =>
  simulatePlan(plan(operations)).snapshots[0].queue.map((entry) => entry.unitId);

describe('action planner mechanics', () => {
  it('uses exact natural AV and retains AG when a waiting unit changes speed', () => {
    const input = plan();
    const result = simulatePlan(input);
    expect(result.records.slice(0, 3).map((record) => record.anchor.unitId)).toEqual([
      'a',
      'b',
      'a'
    ]);
    expect(result.records[0].elapsedAV).toBe(62.5);
    expect(result.records[1].elapsedAV).toBeCloseTo(10000 / 134, 12);
    expect(result.records[2].elapsedAV).toBe(125);
    input.events.push({ anchor: action('a'), operations: [buff('speed', 'b', 2, 66)] });
    const changed = simulatePlan(input);
    expect(changed.snapshots[1].queue[0]).toMatchObject({
      unitId: 'b',
      remainingAG: 1625,
      effectiveSpeed: 200,
      remainingAV: 8.125
    });
    expect(changed.records[1].elapsedAV).toBe(70.625);
    expect(changed.records[1].deltaAV).toBe(8.125);
  });

  it('inserts consecutive zero batches last first and refreshes already-zero targets', () => {
    expect(order([advance('first', ['a']), advance('second', ['b'])])).toEqual(['b', 'a']);
    expect(
      order([advance('first', ['a']), advance('second', ['b']), advance('again', ['a'], 25)])
    ).toEqual(['a', 'b']);
    expect(
      order([advance('first', ['a']), advance('second', ['b']), advance('noop', ['a'], 0)])
    ).toEqual(['b', 'a']);
    expect(
      simulatePlan(plan([advance('first', ['a']), advance('second', ['b'])])).records[0].deltaAV
    ).toBe(0);
  });

  it('preserves pre-operation order inside a group, including overlapping zero batches', () => {
    const input = plan();
    input.units.push(unit('c', 100, 2));
    input.events[0].operations = [advance('b-first', ['b']), advance('group', ['c', 'a'])];
    expect(simulatePlan(input).snapshots[0].queue.map((entry) => entry.unitId)).toEqual([
      'a',
      'c',
      'b'
    ]);
    input.events[0].operations.push(advance('overlap', ['c', 'b']));
    expect(simulatePlan(input).snapshots[0].queue.map((entry) => entry.unitId)).toEqual([
      'c',
      'b',
      'a'
    ]);
    input.events[0].operations = [
      { id: 'all', type: 'immediatelyAct', target: { kind: 'allies' } }
    ];
    expect(simulatePlan(input).snapshots[0].queue.map((entry) => entry.unitId)).toEqual([
      'a',
      'b',
      'c'
    ]);
  });

  it('distinguishes 100% advance from immediate action after over-full delay', () => {
    const delay: EffectOperation = {
      id: 'delay',
      type: 'delay',
      target: target('a'),
      percent: 150
    };
    const advanced = simulatePlan(plan([delay, advance('pull', ['a'])])).snapshots[0].queue.find(
      (entry) => entry.unitId === 'a'
    )!;
    expect(advanced.remainingAG).toBe(15000);
    expect(advanced.remainingAV).toBe(93.75);
    expect(
      simulatePlan(plan([delay, { id: 'now', type: 'immediatelyAct', target: target('a') }]))
        .snapshots[0].queue[0]
    ).toMatchObject({ unitId: 'a', remainingAG: 0 });
  });

  it('snapshots existing buffs and does not decrement buffs added within the active turn', () => {
    const before = plan([buff('before', 'a', 2)]);
    before.events.push({ anchor: action('a'), operations: [buff('during', 'a', 2)] });
    const result = simulatePlan(before);
    const a = result.snapshots[1].queue.find((entry) => entry.unitId === 'a')!;
    expect(a.modifiers.map((entry) => [entry.operationId, entry.remainingTurns])).toEqual([
      ['before', 1],
      ['during', 2]
    ]);
    const aSecond = result.records.findIndex(
      (record) => record.anchor.unitId === 'a' && record.anchor.turn === 2
    );
    expect(
      result.snapshots[aSecond + 1].queue
        .find((entry) => entry.unitId === 'a')!
        .modifiers.map((entry) => [entry.operationId, entry.remainingTurns])
    ).toEqual([['during', 1]]);
  });

  it('expires one-turn speed before computing the next natural AV', () => {
    const input = plan([buff('one', 'a', 1)]);
    input.units = [unit('a', 100)];
    const result = simulatePlan(input);
    expect(result.records[0].elapsedAV).toBeCloseTo(10000 / 150);
    expect(result.snapshots[1].queue[0]).toMatchObject({
      effectiveSpeed: 100,
      remainingAV: 100,
      modifiers: []
    });
  });

  it('uses custom base speed and independent instances with explicit removal and refresh', () => {
    const input = plan([
      buff('flat', 'a', 2, 10),
      {
        id: 'percent',
        type: 'addSpeedModifier',
        target: target('a'),
        mode: 'percent',
        amount: 20,
        turns: 2
      }
    ]);
    input.units[0].baseSpeed = 120;
    input.events.push({
      anchor: action('a'),
      operations: [
        { id: 'remove', type: 'removeSpeedModifier', instanceIds: [modifierId('flat', 'a')] },
        buff('fresh', 'a', 3, 10)
      ]
    });
    const result = simulatePlan(input);
    expect(result.snapshots[0].queue[0].effectiveSpeed).toBe(194);
    const modifiers = result.snapshots[1].queue.find((entry) => entry.unitId === 'a')!.modifiers;
    expect(modifiers.map((entry) => [entry.id, entry.remainingTurns])).toEqual([
      [modifierId('percent', 'a'), 1],
      [modifierId('fresh', 'a'), 3]
    ]);
    expect(modifiers[1].id).not.toBe(modifierId('flat', 'a'));
  });

  it('creates separate group buff instances and can remove just one target instance', () => {
    const input = plan([
      {
        id: 'group',
        type: 'addSpeedModifier',
        target: { kind: 'allies' },
        mode: 'flat',
        amount: 10,
        turns: 2
      },
      { id: 'remove', type: 'removeSpeedModifier', instanceIds: [modifierId('group', 'a')] }
    ]);
    const queue = simulatePlan(input).snapshots[0].queue;
    expect(queue.find((entry) => entry.unitId === 'a')!.modifiers).toEqual([]);
    expect(queue.find((entry) => entry.unitId === 'b')!.modifiers[0].id).toBe(
      modifierId('group', 'b')
    );
  });

  it('does not duplicate or advance the active actor and supports same-node editor previews', () => {
    const initial = createInitialState(plan());
    const copy = structuredClone(initial);
    const step = stepSimulation(initial, [advance('self', ['a']), buff('during', 'a', 2)]);
    expect(initial).toEqual(copy);
    expect(step.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'active-target', operationId: 'self' })
    );
    expect(step.state.units.find((entry) => entry.id === 'a')!.remainingAG).toBe(10000);
    const preview = applyOperations(
      step.record.beforeEffects,
      [buff('preview', 'a', 2)],
      action('a')
    );
    expect(preview.state.units.find((entry) => entry.id === 'a')!.modifiers[0].id).toBe(
      modifierId('preview', 'a')
    );
    expect(step.record.beforeEffects.units.find((entry) => entry.id === 'a')!.modifiers).toEqual(
      []
    );
  });

  it('replays deterministically with stable unit-turn anchors and retains missing anchors', () => {
    const input = plan();
    input.events.push({ anchor: action('b'), operations: [advance('later', ['a'])] });
    const original = structuredClone(input);
    expect(simulatePlan(input)).toEqual(simulatePlan(input));
    expect(input).toEqual(original);
    input.units[0].panelSpeed = 90;
    const changed = simulatePlan(input);
    expect(changed.records[0].anchor).toEqual(action('b'));
    expect(changed.snapshots[1].queue[0].unitId).toBe('a');
    input.units = [unit('replacement', 90)];
    const removed = simulatePlan(input);
    expect(removed.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unreached-anchor', anchor: action('b') })
    );
    expect(
      removed.records.some((record) => anchorKey(record.anchor) === anchorKey(action('b')))
    ).toBe(false);
  });

  it('stops on invalid effective speed without publishing an unfinished turn', () => {
    const input = plan();
    input.events.push({ anchor: action('a', 2), operations: [buff('invalid', 'b', 1, -134)] });
    const result = simulatePlan(input);
    expect(result.stopReason).toBe('error');
    expect(result.records).toHaveLength(2);
    expect(result.snapshots).toHaveLength(3);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-speed', operationId: 'invalid', unitId: 'b' })
    );
    const expiring = plan([buff('negative', 'a', 3, -170), buff('positive', 'a', 1, 50)]);
    // The first operation itself is invalid: subsequent rescue must never mask it.
    expect(simulatePlan(expiring).stopReason).toBe('error');
    expiring.events[0].operations.reverse();
    const expiryResult = simulatePlan(expiring);
    expect(expiryResult.records.some((record) => record.anchor.unitId === 'a')).toBe(false);
    expect(expiryResult.snapshots).toHaveLength(expiryResult.records.length + 1);
    expect(expiryResult.stopReason).toBe('error');
  });

  it('warns about dangling targets and modifier references without silent rebinding', () => {
    const result = simulatePlan(
      plan([
        advance('missing', ['deleted']),
        { id: 'expired', type: 'removeSpeedModifier', instanceIds: ['unknown'] }
      ])
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'missing-target',
      'missing-modifier'
    ]);
    expect(result.records[0].elapsedAV).toBe(62.5);
  });

  it('enforces both budgets, including repeated zero AV turns, and validates parameters', () => {
    const input = plan();
    input.maxActions = 3;
    input.events = Array.from({ length: 5 }, (_, i) => ({
      anchor: i ? action('a', i) : start,
      operations: [advance(`pull-${i}`, ['a'])]
    }));
    const result = simulatePlan(input);
    expect(result.records).toHaveLength(3);
    expect(result.stopReason).toBe('actions');
    input.maxAV = 10;
    input.events = [];
    expect(simulatePlan(input)).toMatchObject({ records: [], stopReason: 'av' });
    for (const value of [0, -1, NaN, Infinity]) {
      const invalid = plan();
      invalid.units[0].panelSpeed = value;
      expect(simulatePlan(invalid)).toMatchObject({ stopReason: 'error', snapshots: [] });
    }
    for (const operations of [[advance('negative', ['a'], -1)], [buff('fractional', 'a', 1.5)]])
      expect(simulatePlan(plan(operations)).stopReason).toBe('error');
    input.maxActions = 501;
    expect(simulatePlan(input).stopReason).toBe('error');
  });

  it('breaks natural ties by camp and position rather than insertion order', () => {
    const input = plan();
    input.units = [
      { ...unit('enemy', 100), camp: 'enemy' },
      unit('second', 100, 1),
      unit('first', 100)
    ];
    expect(
      simulatePlan(input)
        .records.slice(0, 3)
        .map((record) => record.anchor.unitId)
    ).toEqual(['first', 'second', 'enemy']);
  });
});
