import { describe, expect, it } from 'vitest';
import {
  anchorKey,
  applyOperations,
  createInitialState,
  simulatePlan,
  stepSimulation
} from '../../src/lib/action-planner/engine';
import type {
  ActorConfig,
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationPlan,
  SimulationResult,
  Target
} from '../../src/lib/action-planner/types';

const target = (...participantIds: string[]): Target => ({ kind: 'participants', participantIds });
const actor = (id: string, panelSpeed: number, position = 0): ActorConfig => ({
  id,
  kind: 'actor',
  name: id,
  camp: 'ally',
  position,
  baseSpeed: 100,
  panelSpeed
});
const action = (participantId: string, turn = 1): EventAnchor => ({
  kind: 'action',
  participantId,
  turn
});
const advance = (
  id: string,
  ids: string[],
  percent = 100,
  phase?: EffectPhase
): EffectOperation => ({ id, type: 'advance', target: target(...ids), percent, phase });
const speed = (
  id: string,
  ids: string[],
  turns: number | null,
  amount = 50,
  phase?: EffectPhase
): EffectOperation => ({
  id,
  type: 'addSpeedModifier',
  target: target(...ids),
  mode: 'flat',
  amount,
  duration: { kind: 'turns', turns },
  phase
});
const plan = (operations: EffectOperation[] = []): SimulationPlan => ({
  actors: [actor('a', 160), actor('b', 134, 1)],
  events: [{ anchor: { kind: 'start' }, operations }],
  maxNodes: 12,
  maxAV: 600
});
const order = (operations: EffectOperation[]) =>
  simulatePlan(plan(operations)).snapshots[0].queue.map((entry) => entry.id);
const entry = (result: SimulationResult, step: number, id: string) =>
  result.snapshots[step].queue.find((participant) => participant.id === id)!;

describe('action planner mechanism contracts', () => {
  it('uses exact natural AV and retains waiting AG when speed changes', () => {
    const input = plan();
    const result = simulatePlan(input);
    expect(result.records.slice(0, 3).map((record) => record.id)).toEqual(['a', 'b', 'a']);
    expect(result.records[0].elapsedAV).toBe(62.5);
    expect(result.records[1].elapsedAV).toBeCloseTo(10000 / 134, 12);
    expect(result.records[2].elapsedAV).toBe(125);
    input.events.push({
      anchor: action('a'),
      operations: [speed('speed', ['b'], 2, 66, 'preAction')]
    });
    const changed = simulatePlan(input);
    expect(entry(changed, 1, 'b')).toMatchObject({
      remainingAG: 1625,
      effectiveSpeed: 200,
      remainingAV: 8.125
    });
    expect(changed.records[1]).toMatchObject({ elapsedAV: 70.625, deltaAV: 8.125 });
  });
  it('distinguishes full advance from immediate action after over-full delay', () => {
    const delay: EffectOperation = {
      id: 'delay',
      type: 'delay',
      target: target('a'),
      percent: 150
    };
    expect(entry(simulatePlan(plan([delay, advance('pull', ['a'])])), 0, 'a')).toMatchObject({
      remainingAG: 15000,
      remainingAV: 93.75
    });
    expect(
      entry(
        simulatePlan(plan([delay, { id: 'now', type: 'immediatelyAct', target: target('a') }])),
        0,
        'a'
      ).remainingAG
    ).toBe(0);
  });
  it('refreshes zero priority last-first, preserves group order and ignores zero-percent refresh', () => {
    expect(order([advance('first', ['a']), advance('second', ['b'])])).toEqual(['b', 'a']);
    expect(
      order([advance('first', ['a']), advance('second', ['b']), advance('again', ['a'], 25)])
    ).toEqual(['a', 'b']);
    expect(
      order([advance('first', ['a']), advance('second', ['b']), advance('noop', ['a'], 0)])
    ).toEqual(['b', 'a']);
    const input = plan([
      advance('b-first', ['b']),
      advance('group', ['c', 'a']),
      advance('overlap', ['c', 'b'])
    ]);
    input.actors.push(actor('c', 100, 2));
    expect(simulatePlan(input).snapshots[0].queue.map((participant) => participant.id)).toEqual([
      'c',
      'b',
      'a'
    ]);
    input.events[0].operations = [
      { id: 'all', type: 'immediatelyAct', target: { kind: 'allies' } }
    ];
    expect(simulatePlan(input).snapshots[0].queue.map((participant) => participant.id)).toEqual([
      'a',
      'b',
      'c'
    ]);
  });
  it('ages only existing modifiers in both windows and keeps AG/zero priority on expiry', () => {
    for (const phase of ['preAction', 'postAction'] as const) {
      const input = plan([speed('existing', ['a'], 2)]);
      input.events.push({
        anchor: action('a'),
        operations: [speed('during', ['a'], 1, 50, phase)]
      });
      const result = simulatePlan(input);
      expect(
        entry(result, 1, 'a').modifiers.map((buff) => [buff.operationId, buff.lifetime])
      ).toEqual([
        ['existing', { kind: 'turns', remainingTurns: 1 }],
        ['during', { kind: 'turns', remainingTurns: 1 }]
      ]);
      const second = result.records.findIndex(
        (record) => anchorKey(record.anchor) === anchorKey(action('a', 2))
      );
      expect(entry(result, second + 1, 'a').modifiers).toEqual([]);
    }
    const input = plan([speed('one', ['a'], 1)]);
    input.actors = [actor('a', 100)];
    input.events.push({
      anchor: action('a'),
      operations: [advance('pull', ['a'], 24, 'postAction')]
    });
    const result = simulatePlan(input);
    expect(entry(result, 1, 'a')).toMatchObject({
      remainingAG: 7600,
      effectiveSpeed: 100,
      remainingAV: 76,
      modifiers: []
    });
    expect(result.records[1].elapsedAV).toBeCloseTo(10000 / 150 + 76, 12);
    input.events[1].operations = [advance('pull', ['a'], 100, 'postAction')];
    expect(simulatePlan(input).records[1].deltaAV).toBe(0);
  });
  it('uses custom base speed and independent group modifier instances', () => {
    const input = plan([
      speed('flat', ['a', 'b'], 2, 10),
      {
        id: 'percent',
        type: 'addSpeedModifier',
        target: target('a'),
        mode: 'percent',
        amount: 20,
        duration: { kind: 'turns', turns: 2 }
      }
    ]);
    input.actors[0].baseSpeed = 120;
    input.events.push({
      anchor: action('a'),
      operations: [speed('fresh', ['a'], 3, 10, 'preAction')]
    });
    const result = simulatePlan(input);
    expect(entry(result, 0, 'a').effectiveSpeed).toBe(194);
    const instances = [...entry(result, 1, 'a').modifiers, ...entry(result, 1, 'b').modifiers];
    expect(new Set(instances.map((buff) => buff.id)).size).toBe(instances.length);
    expect(entry(result, 1, 'a').modifiers.map((buff) => buff.operationId)).toEqual([
      'flat',
      'percent',
      'fresh'
    ]);
  });
  it('excludes the active actor from pre-action gauge changes and preserves immutable previews', () => {
    const initial = createInitialState(plan());
    const original = structuredClone(initial);
    const step = stepSimulation(initial, [
      advance('self', ['a'], 100, 'preAction'),
      speed('during', ['a'], 2, 50, 'preAction')
    ]);
    expect(initial).toEqual(original);
    expect(step.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'active-target', operationId: 'self' })
    );
    expect(step.state.participants.find((participant) => participant.id === 'a')?.remainingAG).toBe(
      10000
    );
    const preview = applyOperations(
      step.record.beforeEffects,
      [speed('preview', ['a'], 2, 50, 'preAction')],
      action('a')
    );
    expect(preview.state).not.toEqual(step.record.beforeEffects);
    expect(step.record.beforeEffects).toEqual(stepSimulation(initial, []).record.beforeEffects);
  });
  it('replays stable anchors deterministically, keeping dangling anchors and targets', () => {
    const input = plan();
    input.events.push({
      anchor: action('b'),
      operations: [advance('later', ['a'], 100, 'preAction')]
    });
    const original = structuredClone(input);
    expect(simulatePlan(input)).toEqual(simulatePlan(input));
    expect(input).toEqual(original);
    input.actors[0].panelSpeed = 90;
    expect(simulatePlan(input).records[0].anchor).toEqual(action('b'));
    input.actors = [actor('replacement', 90)];
    expect(simulatePlan(input).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unreached-anchor', anchor: action('b') })
    );
    const missing = simulatePlan(plan([advance('missing', ['deleted'])]));
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['missing-target']);
    expect(missing.records[0].elapsedAV).toBe(62.5);
  });
  it('publishes no partial node on invalid additions or expiry, even if a later operation would rescue speed', () => {
    const input = plan();
    input.events.push({
      anchor: action('a', 2),
      operations: [speed('invalid', ['b'], 1, -134, 'preAction')]
    });
    const result = simulatePlan(input);
    expect(result.stopReason).toBe('error');
    expect(result.records).toHaveLength(2);
    expect(result.snapshots).toHaveLength(3);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-speed', operationId: 'invalid', participantId: 'b' })
    );
    const expiring = plan([speed('positive', ['a'], 1, 50), speed('negative', ['a'], 3, -170)]);
    expiring.actors = [actor('a', 160)];
    expect(simulatePlan(expiring)).toMatchObject({
      stopReason: 'error',
      records: [],
      snapshots: [expect.anything()]
    });
    expiring.events[0].operations.reverse();
    expect(simulatePlan(expiring)).toMatchObject({
      stopReason: 'error',
      records: [],
      snapshots: []
    });
  });
  it('protects node and AV budgets including zero-AV chains and rejects invalid numbers', () => {
    const input = plan([advance('start', ['a'])]);
    input.maxNodes = 3;
    input.events.push(
      ...Array.from({ length: 4 }, (_, i) => ({
        anchor: action('a', i + 1),
        operations: [advance(`pull-${i}`, ['a'], 100, 'postAction')]
      }))
    );
    const result = simulatePlan(input);
    expect(result.records).toHaveLength(3);
    expect(result.records.every((record) => record.elapsedAV === 0)).toBe(true);
    expect(result.stopReason).toBe('nodes');
    expect(simulatePlan({ ...plan(), maxAV: 10 })).toMatchObject({ records: [], stopReason: 'av' });
    for (const value of [0, -1, NaN, Infinity]) {
      const invalid = plan();
      invalid.actors[0].panelSpeed = value;
      expect(simulatePlan(invalid)).toMatchObject({ stopReason: 'error', snapshots: [] });
    }
    for (const turns of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(simulatePlan(plan([speed('bad', ['a'], turns)])).stopReason).toBe('error');
    expect(simulatePlan(plan([advance('negative', ['a'], -1)])).stopReason).toBe('error');
    expect(simulatePlan({ ...plan(), maxNodes: 501 }).stopReason).toBe('error');
  });
  it('preserves initial natural camp/position ordering regardless of input insertion order', () => {
    const input = plan();
    input.actors = [
      { ...actor('enemy', 100), camp: 'enemy' },
      actor('second', 100, 1),
      actor('first', 100)
    ];
    expect(
      simulatePlan(input)
        .records.slice(0, 3)
        .map((record) => record.id)
    ).toEqual(['first', 'second', 'enemy']);
  });
  it('preserves the 160/134 SPD two-window regression: second action at 125 or 110 AV', () => {
    for (const [phase, expectedAV, expectedAG] of [
      ['preAction', 125, 10000],
      ['postAction', 110, 7600]
    ] as const) {
      const input = plan();
      input.events.push({
        anchor: action('a'),
        operations: [advance('dance', ['a', 'b'], 24, phase)]
      });
      const result = simulatePlan(input);
      expect(
        result.records.find((record) => anchorKey(record.anchor) === anchorKey(action('a', 2)))
          ?.elapsedAV
      ).toBe(expectedAV);
      expect(result.records.find((record) => record.id === 'b')?.elapsedAV).toBe(62.5);
      expect(entry(result, 1, 'a').remainingAG).toBe(expectedAG);
    }
  });
  it('resolves each window in configured order and retains post-action immediate semantics', () => {
    const initial = createInitialState(plan());
    const step = stepSimulation(initial, [
      advance('post', ['a', 'b'], 100, 'postAction'),
      advance('pre', ['b'], 100, 'preAction'),
      { id: 'delay', type: 'delay', target: target('b'), percent: 50, phase: 'preAction' },
      { id: 'post-delay', type: 'delay', target: target('a'), percent: 25, phase: 'postAction' }
    ]);
    expect(step.state.participants.find((participant) => participant.id === 'a')?.remainingAG).toBe(
      2500
    );
    expect(stepSimulation(step.state, []).record.id).toBe('b');
    const delay: EffectOperation = {
      id: 'delay',
      type: 'delay',
      target: target('a'),
      percent: 150,
      phase: 'postAction'
    };
    expect(
      stepSimulation(initial, [
        delay,
        advance('pull', ['a'], 100, 'postAction')
      ]).state.participants.find((participant) => participant.id === 'a')?.remainingAG
    ).toBe(15000);
    const immediate = stepSimulation(initial, [
      delay,
      { id: 'now', type: 'immediatelyAct', target: target('a'), phase: 'postAction' }
    ]);
    expect(stepSimulation(immediate.state, []).record).toMatchObject({
      anchor: action('a', 2),
      deltaAV: 0
    });
    const input = plan();
    input.events.push({
      anchor: action('a'),
      operations: [speed('invalid', ['a'], 1, -160, 'postAction')]
    });
    expect(simulatePlan(input)).toMatchObject({
      stopReason: 'error',
      records: [],
      snapshots: [expect.anything()]
    });
  });
  it('keeps infinite positive and negative speed effects through replay', () => {
    const input = plan([speed('positive', ['a'], null, 20), speed('negative', ['a'], null, -10)]);
    input.actors = [actor('a', 100)];
    const result = simulatePlan(JSON.parse(JSON.stringify(input)));
    expect(result.records[0].elapsedAV).toBeCloseTo(10000 / 110, 12);
    expect(
      result.snapshots.every(
        (snapshot) =>
          snapshot.queue[0].effectiveSpeed === 110 &&
          snapshot.queue[0].modifiers.every(
            (buff) => buff.lifetime.kind === 'turns' && buff.lifetime.remainingTurns === null
          )
      )
    ).toBe(true);
  });
  it('rejects unknown operations, malformed JSON and missing/invalid action windows', () => {
    for (const raw of [null, {}, { actors: [], events: [null], maxNodes: 1, maxAV: 1 }])
      expect(simulatePlan(raw as unknown as SimulationPlan).stopReason).toBe('error');
    const invalidCamp = plan();
    invalidCamp.actors[0].camp = JSON.parse('["ally"]');
    expect(simulatePlan(invalidCamp).stopReason).toBe('error');
    const input = plan();
    input.events.push({ anchor: action('a'), operations: [advance('no-phase', ['a'])] });
    expect(simulatePlan(input).stopReason).toBe('error');
    input.events[1].operations[0].phase = JSON.parse('["preAction"]');
    expect(simulatePlan(input).stopReason).toBe('error');
    input.events = [
      { anchor: { kind: 'start' }, operations: JSON.parse('[{"id":"unknown","type":"retired"}]') }
    ];
    expect(simulatePlan(input).diagnostics[0].code).toBe('invalid-input');
    input.events = [
      { anchor: { kind: 'start' }, operations: [advance('bad-window', ['a'], 24, 'preAction')] }
    ];
    expect(simulatePlan(input).stopReason).toBe('error');
  });
});
