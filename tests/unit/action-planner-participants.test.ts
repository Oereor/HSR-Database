import { describe, expect, it } from 'vitest';
import {
  applyOperations,
  countdownParticipantId,
  createInitialState,
  effectiveSpeed,
  previewOperationState,
  simulatePlan,
  spawnedParticipantId,
  stepSimulation,
  validatePlan
} from '../../src/lib/action-planner/engine';
import { selectableTargets } from '../../src/lib/action-planner/targeting';
import type {
  ActorConfig,
  ActorDefinition,
  EffectOperation,
  EventAnchor,
  SimulationPlan,
  Target
} from '../../src/lib/action-planner/types';
const target = (...participantIds: string[]): Target => ({ kind: 'participants', participantIds });
const actor = (id: string, position = 0): ActorConfig => ({
  id,
  kind: 'actor',
  name: id,
  camp: 'ally',
  position,
  baseSpeed: 100,
  panelSpeed: 100
});
const summon: ActorDefinition = {
  kind: 'actor',
  category: 'summon',
  name: 'Synthetic summon',
  camp: 'ally',
  baseSpeed: 100,
  panelSpeed: 100,
  actionLimit: 1
};
const action = (participantId: string, turn = 1): EventAnchor => ({
  kind: 'action',
  participantId,
  turn
});
const trigger = (participantId: string): EventAnchor => ({ kind: 'trigger', participantId });
const plan = (operations: EffectOperation[] = []): SimulationPlan => ({
  actors: [actor('a'), actor('b', 1)],
  events: [{ anchor: { kind: 'start' }, operations }],
  maxNodes: 12,
  maxAV: 600
});
const spawn = (
  id: string,
  initialAG?: number
): Extract<EffectOperation, { type: 'spawnParticipant' }> => ({
  id,
  type: 'spawnParticipant',
  participant: { ...summon, initialAG }
});
const timer = (
  id: string,
  speed = 100
): Extract<EffectOperation, { type: 'spawnParticipant' }> => ({
  id,
  type: 'spawnParticipant',
  participant: { kind: 'scheduledEvent', name: 'Synthetic event', speed }
});
const timedSpeed: EffectOperation = {
  id: 'timed',
  type: 'addSpeedModifier',
  target: { kind: 'allies' },
  mode: 'flat',
  amount: 50,
  duration: { kind: 'countdown', name: 'Synthetic expiry', speed: 200 }
};

describe('dynamic queue participant contracts', () => {
  it('allows an event-only initial queue, one trigger, then a finite actor with editable anchors', () => {
    const eventId = spawnedParticipantId('event'),
      childId = spawnedParticipantId('child');
    const input = plan([timer('event', 90)]);
    input.actors = [];
    input.events.push({ anchor: trigger(eventId), operations: [spawn('child', 0)] });
    input.events.push({
      anchor: action(childId),
      operations: [
        { id: 'finish', type: 'delay', target: target(childId), percent: 25, phase: 'postAction' }
      ]
    });
    const result = simulatePlan(input);
    expect(result.records.map((record) => record.anchor)).toEqual([
      trigger(eventId),
      action(childId)
    ]);
    expect(result.records.map((record) => record.kind)).toEqual(['scheduledEvent', 'actor']);
    expect(result.records[0].elapsedAV).toBeCloseTo(10000 / 90, 12);
    expect(result.records[1].deltaAV).toBe(0);
    expect(result.snapshots.at(-1)).toMatchObject({
      completedNodes: 2,
      completedActions: 1,
      queue: []
    });
    expect(result.stopReason).toBe('empty');
    expect(result.diagnostics).toEqual([]);
    expect(result.records[1].name).toBe(summon.name);
  });
  it('settles the final actor post-action window before removal while unlimited actors repeat', () => {
    const input = plan();
    input.actors[0].actionLimit = 2;
    input.events.push({
      anchor: action('a', 2),
      operations: [
        { ...timer('last'), phase: 'postAction' },
        { id: 'pull', type: 'advance', target: target('b'), percent: 100, phase: 'postAction' }
      ]
    });
    const result = simulatePlan(input);
    expect(
      result.records.filter((record) => record.id === 'a').map((record) => record.anchor)
    ).toEqual([action('a'), action('a', 2)]);
    const last = result.records.findIndex(
      (record) => record.id === 'a' && record.anchor.kind === 'action' && record.anchor.turn === 2
    );
    expect(result.snapshots[last + 1].queue.map((participant) => participant.id)).toEqual([
      'b',
      spawnedParticipantId('last')
    ]);
    expect(result.records[last + 1]).toMatchObject({ id: 'b', deltaAV: 0 });
    expect(result.records.filter((record) => record.id === 'b').length).toBeGreaterThan(2);
  });
  it('creates in operation order, keeps multiple same-name identities and preserves references on edits/deletion', () => {
    const childId = spawnedParticipantId('child'),
      otherId = spawnedParticipantId('other');
    const input = plan();
    input.actors = [actor('a')];
    input.events.push({
      anchor: action('a'),
      operations: [
        { ...spawn('child'), phase: 'preAction' },
        {
          id: 'pull-child',
          type: 'advance',
          target: target(childId),
          percent: 100,
          phase: 'preAction'
        },
        { ...spawn('other', 0), phase: 'preAction' }
      ]
    });
    input.events.push({
      anchor: action(childId),
      operations: [
        { id: 'pull-a', type: 'advance', target: target('a'), percent: 100, phase: 'postAction' }
      ]
    });
    const original = structuredClone(input),
      result = simulatePlan(input);
    expect(result.records.slice(0, 4).map((record) => record.id)).toEqual([
      'a',
      childId,
      'a',
      otherId
    ]);
    expect(
      result.participants
        .filter((participant) => participant.name === summon.name)
        .map((participant) => participant.id)
    ).toEqual([childId, otherId]);
    expect(simulatePlan(input)).toEqual(result);
    expect(input).toEqual(original);
    input.actors[0].panelSpeed = 200;
    expect(simulatePlan(input).records.some((record) => record.id === childId)).toBe(true);
    input.events[1].operations = input.events[1].operations.filter((op) => op.id !== 'child');
    const deleted = simulatePlan(input);
    expect(deleted.records.some((record) => record.id === childId)).toBe(false);
    expect(deleted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unreached-anchor', anchor: action(childId) })
    );
    expect(deleted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'missing-target', operationId: 'pull-child' })
    );
    // Moving the pull before creation must not guess/rebind an instance.
    const reordered = structuredClone(original);
    reordered.events[1].operations.reverse();
    expect(simulatePlan(reordered).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'missing-target', operationId: 'pull-child' })
    );
    const record = result.records[0];
    const preview = previewOperationState(
      record.beforeEffects,
      original.events[1].operations,
      record.anchor,
      'preAction',
      'pull-child'
    );
    expect(preview?.participants.some((participant) => participant.id === childId)).toBe(true);
    expect(
      record.beforeEffects.participants.some((participant) => participant.id === childId)
    ).toBe(false);
  });
  it('appends dynamic natural ties by creation order, with no event priority, while zero insertion still wins', () => {
    const input = plan([timer('event'), spawn('summon')]);
    input.actors[1].camp = 'enemy';
    input.actors[1].position = 0;
    expect(
      simulatePlan(input)
        .records.slice(0, 4)
        .map((record) => record.id)
    ).toEqual(['a', 'b', spawnedParticipantId('event'), spawnedParticipantId('summon')]);
    input.events[0].operations.reverse();
    expect(
      simulatePlan(input)
        .records.slice(0, 4)
        .map((record) => record.id)
    ).toEqual(['a', 'b', spawnedParticipantId('summon'), spawnedParticipantId('event')]);
    input.events[0].operations.push({
      id: 'pull-event',
      type: 'advance',
      target: target(spawnedParticipantId('event')),
      percent: 100
    });
    expect(simulatePlan(input).records[0]).toMatchObject({
      id: spawnedParticipantId('event'),
      deltaAV: 0
    });
  });
  it('excludes countdowns from camp targets and shares explicit-singleton restrictions with the picker', () => {
    const eventId = spawnedParticipantId('event');
    const input = plan([
      timer('event'),
      { id: 'all', type: 'advance', target: { kind: 'allies' }, percent: 100 },
      { id: 'event-pull', type: 'advance', target: target(eventId), percent: 50 }
    ]);
    const result = simulatePlan(input);
    expect(
      result.snapshots[0].queue.find((participant) => participant.id === eventId)?.remainingAG
    ).toBe(5000);
    const candidates = result.snapshots[0].queue;
    expect(
      selectableTargets('advance', candidates, ['a']).map((participant) => participant.id)
    ).not.toContain(eventId);
    expect(
      selectableTargets('addSpeedModifier', candidates, []).map((participant) => participant.id)
    ).not.toContain(eventId);
    expect(
      selectableTargets('delay', candidates, []).map((participant) => participant.id)
    ).toContain(eventId);
    for (const op of [
      { id: 'mixed', type: 'advance', target: target('a', eventId), percent: 100 },
      { id: 'now', type: 'immediatelyAct', target: target(eventId) },
      {
        id: 'speed',
        type: 'addSpeedModifier',
        target: target(eventId),
        mode: 'flat',
        amount: 10,
        duration: { kind: 'turns', turns: 1 }
      }
    ] as EffectOperation[]) {
      expect(
        validatePlan({
          ...input,
          events: [
            ...input.events,
            { anchor: action('a'), operations: [{ ...op, phase: 'postAction' }] }
          ]
        })
      ).toContainEqual(expect.objectContaining({ code: 'invalid-target' }));
      const state = applyOperations(createInitialState(plan()), [timer('event')], {
        kind: 'start'
      }).state;
      const invalid = applyOperations(state, [op], { kind: 'start' });
      expect(invalid.state).toEqual(state);
      expect(invalid.diagnostics[0].code).toBe('invalid-target');
    }
  });
  it('links one countdown to group modifiers, expires first and never ages turns at the trigger', () => {
    const countdownId = countdownParticipantId('timed');
    const input = plan([timedSpeed]);
    input.events.push({
      anchor: trigger(countdownId),
      operations: [
        {
          id: 'fresh',
          type: 'addSpeedModifier',
          target: target('a'),
          mode: 'flat',
          amount: 10,
          duration: { kind: 'turns', turns: 2 }
        },
        { id: 'pull', type: 'advance', target: target('a'), percent: 25 }
      ]
    });
    const result = simulatePlan(input);
    expect(
      result.snapshots[0].queue.filter((participant) => participant.kind === 'scheduledEvent')
    ).toHaveLength(1);
    const linked = result.snapshots[0].queue.flatMap((participant) => participant.modifiers);
    expect(new Set(linked.map((buff) => buff.id)).size).toBe(2);
    expect(
      linked.every(
        (buff) => buff.lifetime.kind === 'countdown' && buff.lifetime.participantId === countdownId
      )
    ).toBe(true);
    expect(result.records[0].anchor).toEqual(trigger(countdownId));
    expect(
      result.records[0].beforeEffects.participants
        .filter((participant) => participant.kind === 'actor')
        .map(effectiveSpeed)
    ).toEqual([100, 100]);
    expect(result.snapshots[1]).toMatchObject({ completedNodes: 1, completedActions: 0 });
    const a = result.snapshots[1].queue.find((participant) => participant.id === 'a')!;
    expect(a).toMatchObject({ remainingAG: 0, effectiveSpeed: 110 });
    expect(a.modifiers[0].lifetime).toEqual({ kind: 'turns', remainingTurns: 2 });
    expect(result.snapshots[1].queue.find((participant) => participant.id === 'b')).toMatchObject({
      remainingAG: 2500,
      effectiveSpeed: 100,
      modifiers: []
    });
    expect(result.records[1]).toMatchObject({ id: 'a', elapsedAV: 50, deltaAV: 0 });
    const removed = simulatePlan({
      ...input,
      events: input.events.filter((event) => event.anchor.kind !== 'start')
    });
    expect(removed.records.some((record) => record.id === countdownId)).toBe(false);
    expect(
      removed.snapshots[0].queue.every((participant) => participant.modifiers.length === 0)
    ).toBe(true);
    expect(removed.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unreached-anchor' })
    );
    const slower = plan([
      { ...timedSpeed, duration: { kind: 'countdown', name: 'Renamed', speed: 100 } }
    ]);
    expect(
      simulatePlan(slower).records.find((record) => record.id === countdownId)?.elapsedAV
    ).toBe(100);
  });
  it('adds speed and countdown atomically, skips missing targets and never publishes failed expiry', () => {
    const missing = simulatePlan(plan([{ ...timedSpeed, target: target('deleted') }]));
    expect(
      missing.snapshots[0].queue.some((participant) => participant.kind === 'scheduledEvent')
    ).toBe(false);
    expect(missing.diagnostics[0].code).toBe('missing-target');
    const failed = simulatePlan(plan([{ ...timedSpeed, amount: -100 }]));
    expect(failed).toMatchObject({ stopReason: 'error', records: [], snapshots: [] });
    const countdownId = countdownParticipantId('positive');
    const input = plan([
      { ...timedSpeed, id: 'positive', target: target('a'), amount: 120 },
      {
        id: 'negative',
        type: 'addSpeedModifier',
        target: target('a'),
        mode: 'flat',
        amount: -150,
        duration: { kind: 'turns', turns: null }
      }
    ]);
    input.events.push({
      anchor: trigger(countdownId),
      operations: [
        {
          id: 'rescue',
          type: 'addSpeedModifier',
          target: target('a'),
          mode: 'flat',
          amount: 1000,
          duration: { kind: 'turns', turns: null }
        }
      ]
    });
    expect(simulatePlan(input)).toMatchObject({
      stopReason: 'error',
      records: [],
      snapshots: [expect.anything()],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-speed', anchor: trigger(countdownId) })
      ])
    });
  });
  it('bounds event-only zero-AV chains and rejects identity collisions or malformed creations', () => {
    const input = plan([
      {
        ...timer('event-0'),
        participant: { kind: 'scheduledEvent', name: 'Zero', speed: 100, initialAG: 0 }
      }
    ]);
    input.actors = [];
    input.maxNodes = 3;
    for (let i = 0; i < 5; i++)
      input.events.push({
        anchor: trigger(spawnedParticipantId(`event-${i}`)),
        operations: [
          {
            ...timer(`event-${i + 1}`),
            participant: { kind: 'scheduledEvent', name: 'Zero', speed: 100, initialAG: 0 }
          }
        ]
      });
    const result = simulatePlan(input);
    expect(result).toMatchObject({
      stopReason: 'nodes',
      records: [expect.anything(), expect.anything(), expect.anything()]
    });
    expect(result.records.every((record) => record.elapsedAV === 0)).toBe(true);
    expect(result.snapshots.at(-1)).toMatchObject({ completedNodes: 3, completedActions: 0 });
    const collision = plan([spawn('child')]);
    collision.actors[0].id = spawnedParticipantId('child');
    expect(validatePlan(collision)[0].code).toBe('duplicate-participant');
    const empty = { ...plan(), actors: [] };
    const created = applyOperations(createInitialState(empty), [timer('retired')], {
      kind: 'start'
    }).state;
    const retired = stepSimulation(created, []).state;
    expect(() => applyOperations(retired, [timer('retired')], { kind: 'start' })).toThrow(
      'duplicate-participant'
    );
    for (const definition of [
      { ...summon, actionLimit: 0 },
      { ...summon, initialAG: -1 },
      { kind: 'scheduledEvent', name: 'Bad', speed: 0 }
    ])
      expect(
        simulatePlan(
          plan([
            { id: 'bad', type: 'spawnParticipant', participant: definition } as EffectOperation
          ])
        ).stopReason
      ).toBe('error');
  });
});
