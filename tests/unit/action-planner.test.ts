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
const buff = (id: string, unitId: string, turns: number | null, amount = 50): EffectOperation => ({
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

  it('uses custom base speed and independent instances without overwriting existing instances', () => {
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
      operations: [buff('fresh', 'a', 3, 10)]
    });
    const result = simulatePlan(input);
    expect(result.snapshots[0].queue[0].effectiveSpeed).toBe(194);
    const modifiers = result.snapshots[1].queue.find((entry) => entry.unitId === 'a')!.modifiers;
    expect(modifiers.map((entry) => [entry.id, entry.remainingTurns])).toEqual([
      [modifierId('flat', 'a'), 1],
      [modifierId('percent', 'a'), 1],
      [modifierId('fresh', 'a'), 3]
    ]);
    expect(modifiers[2].id).not.toBe(modifierId('flat', 'a'));
  });

  it('creates separate group buff instances for each target', () => {
    const input = plan([
      {
        id: 'group',
        type: 'addSpeedModifier',
        target: { kind: 'allies' },
        mode: 'flat',
        amount: 10,
        turns: 2
      }
    ]);
    const queue = simulatePlan(input).snapshots[0].queue;
    expect(queue.find((entry) => entry.unitId === 'a')!.modifiers[0].id).toBe(
      modifierId('group', 'a')
    );
    expect(queue.find((entry) => entry.unitId === 'b')!.modifiers[0].id).toBe(
      modifierId('group', 'b')
    );
  });

  it('does not duplicate or advance the active actor and retains independent pre-action snapshots', () => {
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

  it('warns about dangling targets without silent rebinding', () => {
    const result = simulatePlan(plan([advance('missing', ['deleted'])]));
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['missing-target']);
    expect(result.records[0].elapsedAV).toBe(62.5);
  });

  it('enforces both budgets, including repeated zero AV turns, and validates parameters', () => {
    const input = plan();
    input.maxActions = 3;
    input.events = Array.from({ length: 5 }, (_, i) => ({
      anchor: i ? action('a', i) : start,
      operations: [
        { ...advance(`pull-${i}`, ['a']), ...(i ? { phase: 'postAction' as const } : {}) }
      ]
    }));
    const result = simulatePlan(input);
    expect(result.records).toHaveLength(3);
    expect(result.records.every((record) => record.elapsedAV === 0)).toBe(true);
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

describe('action resolution windows', () => {
  it('Sparkle + Dance S5 changes the second natural action from 125 to 110 AV', () => {
    for (const [phase, expectedAV, expectedAG] of [
      ['preAction', 125, 10000],
      ['postAction', 110, 7600]
    ] as const) {
      const input = plan();
      input.events.push({
        anchor: action('a'),
        operations: [{ id: 'dance', type: 'advance', target: target('a', 'b'), percent: 24, phase }]
      });
      const result = simulatePlan(input);
      expect(
        result.records.find((record) => anchorKey(record.anchor) === anchorKey(action('a', 2)))!
          .elapsedAV
      ).toBe(expectedAV);
      expect(result.records.find((record) => record.anchor.unitId === 'b')!.elapsedAV).toBe(62.5);
      expect(result.snapshots[1].queue.find((entry) => entry.unitId === 'a')).toMatchObject({
        remainingAG: expectedAG,
        turn: 2
      });
      expect(
        result.snapshots.every(
          (snapshot) =>
            new Set(snapshot.queue.map((entry) => entry.unitId)).size === input.units.length
        )
      ).toBe(true);
      expect(
        result.records
          .filter((record) => record.anchor.unitId === 'a')
          .map((record) => record.anchor.turn)
      ).toEqual(
        Array.from(
          { length: result.records.filter((record) => record.anchor.unitId === 'a').length },
          (_, index) => index + 1
        )
      );
    }
  });

  it('partitions windows before resolving and preserves each window’s configured order', () => {
    const initial = createInitialState(plan());
    const step = stepSimulation(initial, [
      { ...advance('post', ['a', 'b']), phase: 'postAction' },
      { ...advance('pre', ['b']), phase: 'preAction' },
      { id: 'delay', type: 'delay', target: target('b'), percent: 50, phase: 'preAction' },
      { id: 'post-delay', type: 'delay', target: target('a'), percent: 25, phase: 'postAction' }
    ]);
    // Pre: b=0 then 5000. Post: both=0, then a=2500.
    expect(step.state.units.map((entry) => [entry.id, entry.remainingAG])).toEqual([
      ['a', 2500],
      ['b', 0]
    ]);
    expect(step.state.units.find((entry) => entry.id === 'b')!.zeroBatch).toBeGreaterThan(0);
  });

  it.each(['preAction', 'postAction'] as const)(
    'keeps zero refresh and single/group ordering during %s',
    (phase) => {
      const input = plan();
      input.units.push(unit('c', 100, 2));
      const operations: EffectOperation[] = [
        { ...advance('first', ['b']), phase },
        { ...advance('second', ['c']), phase },
        { ...advance('again', ['b'], 24), phase }
      ];
      const step = stepSimulation(createInitialState(input), operations);
      expect(
        step.state.units
          .filter((entry) => entry.id !== 'a')
          .every((entry) => entry.remainingAG === 0)
      ).toBe(true);
      expect(stepSimulation(step.state, []).record.anchor.unitId).toBe('b');
      const group = stepSimulation(createInitialState(input), [
        { ...advance('first', ['c']), phase },
        { ...advance('group', ['b', 'c']), phase }
      ]);
      expect(stepSimulation(group.state, []).record.anchor.unitId).toBe('c');
    }
  );

  it.each(['preAction', 'postAction'] as const)(
    'does not decrement a speed effect added in %s',
    (phase) => {
      const input = plan([buff('existing', 'a', 2)]);
      input.events.push({
        anchor: action('a'),
        operations: [{ ...buff('during', 'a', 1), phase }]
      });
      const result = simulatePlan(input);
      expect(
        result.snapshots[1].queue
          .find((entry) => entry.unitId === 'a')!
          .modifiers.map((modifier) => [modifier.operationId, modifier.remainingTurns])
      ).toEqual([
        ['existing', 1],
        ['during', 1]
      ]);
      const second = result.records.findIndex(
        (record) => anchorKey(record.anchor) === anchorKey(action('a', 2))
      );
      expect(
        result.snapshots[second + 1].queue.find((entry) => entry.unitId === 'a')!.modifiers
      ).toEqual([]);
    }
  );

  it('expires speed after post-action while preserving the modified next gauge', () => {
    const input = plan([buff('one', 'a', 1)]);
    input.units = [unit('a', 100)];
    input.events.push({
      anchor: action('a'),
      operations: [{ ...advance('pull', ['a'], 24), phase: 'postAction' }]
    });
    const result = simulatePlan(input);
    expect(result.snapshots[1].queue[0]).toMatchObject({
      remainingAG: 7600,
      effectiveSpeed: 100,
      remainingAV: 76,
      modifiers: []
    });
    expect(result.records[1].elapsedAV).toBeCloseTo(10000 / 150 + 76, 12);
    input.events[1].operations = [{ ...advance('pull', ['a']), phase: 'postAction' }];
    const zero = simulatePlan(input);
    expect(zero.records[1].deltaAV).toBe(0);
    expect(zero.snapshots[1].queue[0]).toMatchObject({ remainingAG: 0, effectiveSpeed: 100 });
  });

  it('keeps post-action immediate action distinct from 100% advance and stops before publishing a failed post-action turn', () => {
    const initial = createInitialState(plan());
    const delay: EffectOperation = {
      id: 'delay',
      type: 'delay',
      target: target('a'),
      percent: 150,
      phase: 'postAction'
    };
    const pulled = stepSimulation(initial, [
      delay,
      { ...advance('pull', ['a']), phase: 'postAction' }
    ]);
    expect(pulled.state.units.find((entry) => entry.id === 'a')!.remainingAG).toBe(15000);
    const immediate = stepSimulation(initial, [
      delay,
      { id: 'now', type: 'immediatelyAct', target: target('a'), phase: 'postAction' }
    ]);
    expect(immediate.state.units.find((entry) => entry.id === 'a')!.remainingAG).toBe(0);
    expect(stepSimulation(immediate.state, []).record).toMatchObject({
      anchor: action('a', 2),
      deltaAV: 0
    });

    const input = plan();
    input.events.push({
      anchor: action('a'),
      operations: [{ ...buff('invalid', 'a', 1, -160), phase: 'postAction' }]
    });
    expect(simulatePlan(input)).toMatchObject({
      stopReason: 'error',
      records: [],
      snapshots: [expect.anything()],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-speed',
          anchor: action('a'),
          operationId: 'invalid'
        })
      ])
    });
  });

  it('keeps infinite positive and negative speed effects through normal turns and JSON round trips', () => {
    const input = plan([buff('infinite', 'a', null, 20), buff('debuff', 'a', null, -10)]);
    input.units = [unit('a', 100)];
    const restored: SimulationPlan = JSON.parse(JSON.stringify(input));
    const result = simulatePlan(restored);
    expect(result.records[0].elapsedAV).toBeCloseTo(10000 / 110, 12);
    expect(
      result.snapshots.every(
        (snapshot) =>
          snapshot.queue[0].effectiveSpeed === 110 &&
          snapshot.queue[0].modifiers.every((modifier) => modifier.remainingTurns === null)
      )
    ).toBe(true);
  });

  it('preserves missing-phase behavior and refuses legacy removal rather than changing results silently', () => {
    const input = plan();
    input.events.push({ anchor: action('a'), operations: [advance('legacy', ['a', 'b'], 24)] });
    const explicit = structuredClone(input);
    explicit.events[1].operations[0].phase = 'preAction';
    expect(simulatePlan(input)).toEqual(simulatePlan(explicit));
    const legacy = JSON.parse(JSON.stringify(input)) as SimulationPlan;
    // Deliberately simulate old JSON, outside the new TypeScript operation union.
    legacy.events[1].operations = JSON.parse(
      '[{"id":"retired","type":"removeSpeedModifier","instanceIds":["old"]}]'
    );
    expect(simulatePlan(legacy)).toMatchObject({
      stopReason: 'error',
      records: [],
      snapshots: [],
      diagnostics: [
        {
          code: 'unsupported-legacy-operation',
          severity: 'error',
          anchor: action('a'),
          operationId: 'retired'
        }
      ]
    });
  });

  it('keeps battle-start initialization separate and rejects invalid windows and finite durations', () => {
    const started = simulatePlan(plan([advance('start', ['a'], 24)]));
    expect(started.records[0].elapsedAV).toBe(47.5);
    expect(started.snapshots[0].queue[0].turn).toBe(1);
    const withPhase = plan([{ ...advance('start', ['a']), phase: 'postAction' }]);
    expect(simulatePlan(withPhase).stopReason).toBe('error');
    for (const turns of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(simulatePlan(plan([buff('invalid', 'a', turns)])).stopReason).toBe('error');
    }
    const invalidWindow = plan();
    invalidWindow.events.push({
      anchor: action('a'),
      operations: JSON.parse(
        '[{"id":"bad","type":"advance","phase":"unknown","target":{"kind":"units","unitIds":["a"]},"percent":24}]'
      )
    });
    expect(simulatePlan(invalidWindow).stopReason).toBe('error');
  });
});
