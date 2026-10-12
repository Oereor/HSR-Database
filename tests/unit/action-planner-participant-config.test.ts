import { describe, expect, it } from 'vitest';
import {
  buildParticipantOperation,
  participantDraft,
  type SpawnOperation
} from '../../src/lib/action-planner/participant-config';
import {
  previewOperationState,
  simulatePlan,
  spawnedParticipantId
} from '../../src/lib/action-planner/engine';
import { operationTargets } from '../../src/lib/action-planner/targeting';
import { moveOperation, saveOperation } from '../../src/lib/action-planner/effect-config';
import type { EffectOperation, SimulationPlan } from '../../src/lib/action-planner/types';

const start = { kind: 'start' as const };
const actor: SpawnOperation = {
  id: 'source',
  type: 'spawnParticipant',
  participant: {
    kind: 'actor',
    name: 'Synthetic actor',
    camp: 'ally',
    category: 'summon',
    baseSpeed: 60,
    panelSpeed: 60,
    actionLimit: null,
    iconUrl: '/synthetic.png',
    initialAG: 10000
  }
};
const plan = (operations: EffectOperation[]): SimulationPlan => ({
  actors: [],
  events: [{ anchor: start, operations }],
  maxNodes: 10,
  maxAV: 600
});

describe('participant creation drafts', () => {
  it('rejects incomplete drafts without publishing a partial operation and keeps speeds independent', () => {
    const draft = participantDraft();
    expect(buildParticipantOperation(draft, 'new', start)).toEqual({ invalid: ['name'] });
    draft.name = 'Synthetic';
    draft.baseSpeed = 80;
    expect(draft.panelSpeed).toBe(100);
    for (const value of ['', '0', '-1', '1.5', 'invalid']) {
      draft.actionLimit = value;
      const result = buildParticipantOperation(draft, 'new', start);
      expect(!!result.operation).toBe(value === '');
    }
    draft.actionLimit = '3';
    draft.panelSpeed = NaN;
    expect(buildParticipantOperation(draft, 'new', start).invalid).toContain('panelSpeed');
    draft.kind = 'scheduledEvent';
    draft.speed = 90;
    const event = buildParticipantOperation(draft, 'event', start).operation!;
    expect(event.participant).toEqual({ kind: 'scheduledEvent', name: 'Synthetic', speed: 90 });
    expect(event).not.toHaveProperty('phase');
  });

  it('edits in place while preserving identity, hidden fields and later anchors, and limits lifecycle changes', () => {
    const draft = participantDraft(actor);
    draft.panelSpeed = 80;
    draft.actionLimit = '2';
    expect(actor.participant).toHaveProperty('panelSpeed', 60);
    const edited = buildParticipantOperation(draft, 'ignored', start, actor).operation!;
    expect(edited.id).toBe(actor.id);
    expect(edited.participant).toMatchObject({
      iconUrl: '/synthetic.png',
      initialAG: 10000,
      panelSpeed: 80,
      baseSpeed: 60
    });
    const id = spawnedParticipantId(actor.id);
    const event = {
      anchor: { kind: 'action' as const, participantId: id, turn: 1 },
      operations: [
        {
          id: 'effect',
          phase: 'postAction' as const,
          type: 'advance' as const,
          target: { kind: 'participants' as const, participantIds: [id] },
          percent: 50
        }
      ]
    };
    const simulation = {
      ...plan(saveOperation([actor], edited, start)),
      events: [{ anchor: start, operations: [edited] }, event]
    };
    const result = simulatePlan(simulation);
    expect(result.records).toHaveLength(2);
    expect(result.records.every((record) => record.id === id)).toBe(true);
    expect(result.records[0].elapsedAV).toBe(125);
    expect(result.diagnostics).toEqual([]);
    const removed = simulatePlan({
      ...simulation,
      events: [{ anchor: start, operations: [] }, event]
    });
    expect(removed.records).toEqual([]);
    expect(removed.diagnostics.some((item) => item.code === 'unreached-anchor')).toBe(true);
    expect(simulation.events[1]).toEqual(event);
    draft.kind = 'scheduledEvent';
    expect(buildParticipantOperation(draft, 'ignored', start, actor)).toEqual({
      invalid: ['form']
    });
    expect(spawnedParticipantId('new-source')).not.toBe(id);
  });

  it('uses actual operation order for target availability and execution', () => {
    const id = spawnedParticipantId(actor.id);
    const effect: EffectOperation = {
      id: 'effect',
      type: 'advance',
      target: { kind: 'participants', participantIds: [id] },
      percent: 50
    };
    const source = plan([actor, effect]);
    const initial = simulatePlan(source).startState!;
    expect(
      previewOperationState(
        initial,
        source.events[0].operations,
        start,
        'preAction',
        'effect'
      )?.participants.map((unit) => unit.id)
    ).toEqual([id]);
    const reordered = moveOperation(source.events[0].operations, 'effect', -1, start);
    expect(
      previewOperationState(initial, reordered, start, 'preAction', 'effect')?.participants
    ).toEqual([]);
    expect(
      simulatePlan(plan(reordered)).diagnostics.some((item) => item.code === 'missing-target')
    ).toBe(true);
    expect(simulatePlan(source).records[0].elapsedAV).toBeCloseTo(10000 / 60 / 2);
  });
  it('keeps pending countdowns targetable and excludes them while triggering', () => {
    const event: SpawnOperation = {
      id: 'timer',
      type: 'spawnParticipant',
      participant: { kind: 'scheduledEvent', name: 'Synthetic timer', speed: 90 }
    };
    const source = plan([event]);
    const result = simulatePlan(source);
    const id = spawnedParticipantId(event.id);
    const pending = previewOperationState(
      result.startState!,
      source.events[0].operations,
      start,
      'preAction'
    );
    expect(operationTargets(pending).map((participant) => participant.id)).toEqual([id]);
    expect(operationTargets(result.records[0].beforeEffects)).toEqual([]);
    expect(operationTargets(undefined)).toEqual([]);
  });
});
