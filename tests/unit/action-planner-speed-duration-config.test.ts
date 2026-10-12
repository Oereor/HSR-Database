import { describe, expect, it } from 'vitest';
import {
  speedDurationDraft,
  parseSpeedDuration
} from '../../src/lib/action-planner/speed-duration-config';
import {
  countdownParticipantId,
  simulatePlan,
  validateOperations
} from '../../src/lib/action-planner/engine';
import { saveOperation } from '../../src/lib/action-planner/effect-config';
import type { EffectOperation, SimulationPlan } from '../../src/lib/action-planner/types';

const anchor = { kind: 'start' as const };
const source: Extract<EffectOperation, { type: 'addSpeedModifier' }> = {
  id: 'source',
  type: 'addSpeedModifier',
  target: { kind: 'participants', participantIds: ['actor'] },
  mode: 'flat',
  amount: 60,
  duration: { kind: 'countdown', name: 'Synthetic expiry', speed: 70 }
};
const plan: SimulationPlan = {
  actors: [
    {
      id: 'actor',
      kind: 'actor',
      name: 'Synthetic actor',
      camp: 'ally',
      position: 0,
      baseSpeed: 100,
      panelSpeed: 100
    }
  ],
  events: [{ anchor, operations: [source] }],
  maxNodes: 20,
  maxAV: 600
};

describe('speed duration drafts', () => {
  it('round trips all three durations and validates only the chosen mode', () => {
    for (const duration of [
      { kind: 'turns' as const, turns: 2 },
      { kind: 'turns' as const, turns: null },
      { kind: 'countdown' as const, name: 'Synthetic expiry', speed: 70.5 }
    ]) {
      const parsed = parseSpeedDuration(speedDurationDraft(duration));
      expect(parsed).toEqual({ duration, invalid: [] });
      expect(validateOperations([{ ...source, duration: parsed.duration! }], anchor)).toEqual([]);
    }
    const draft = speedDurationDraft();
    expect(draft).toMatchObject({
      kind: 'turns',
      turns: '2',
      countdownName: '',
      countdownSpeed: 70
    });
    for (const turns of ['0', '-1', '1.5', 'invalid', '9007199254740992'])
      expect(parseSpeedDuration({ ...draft, turns })).toEqual({ invalid: ['turns'] });
    draft.kind = 'countdown';
    expect(parseSpeedDuration(draft)).toEqual({ invalid: ['countdownName'] });
    draft.countdownName = '  Synthetic expiry  ';
    draft.turns = 'invalid';
    for (const countdownSpeed of [undefined, 0, -1, NaN, Infinity])
      expect(parseSpeedDuration({ ...draft, countdownSpeed })).toEqual({
        invalid: ['countdownSpeed']
      });
    expect(parseSpeedDuration(draft)).toEqual({
      duration: { kind: 'countdown', name: 'Synthetic expiry', speed: 70 },
      invalid: []
    });
    draft.kind = 'turns';
    draft.turns = '';
    expect(parseSpeedDuration(draft).duration).toEqual({ kind: 'turns', turns: null });
    expect(draft.countdownName).toBe('  Synthetic expiry  ');
    draft.kind = 'countdown';
    expect(parseSpeedDuration(draft).duration).toMatchObject({ kind: 'countdown', speed: 70 });
  });

  it('keeps source identity and trigger operations through edits, mode changes, deletion and restoration', () => {
    const id = countdownParticipantId(source.id);
    const trigger = {
      anchor: { kind: 'trigger' as const, participantId: id },
      operations: [{ id: 'finish', type: 'immediatelyAct' as const, target: source.target }]
    };
    const draft = speedDurationDraft(source.duration);
    draft.countdownName = 'Synthetic renamed';
    draft.countdownSpeed = 90;
    expect(source.duration).toEqual({ kind: 'countdown', name: 'Synthetic expiry', speed: 70 });
    const edited = { ...source, amount: 20, duration: parseSpeedDuration(draft).duration! };
    const editedPlan = {
      ...plan,
      events: [{ anchor, operations: saveOperation([source], edited, anchor) }, trigger]
    };
    const result = simulatePlan(editedPlan);
    const event = result.records.find((record) => record.id === id)!;
    expect(event.name).toBe('Synthetic renamed');
    expect(event.elapsedAV).toBeCloseTo(10000 / 90);
    expect(result.records[result.records.indexOf(event) + 1]).toMatchObject({
      id: 'actor',
      deltaAV: 0
    });
    expect(result.diagnostics).toEqual([]);
    for (const duration of [
      { kind: 'turns' as const, turns: 2 },
      { kind: 'turns' as const, turns: null }
    ]) {
      const changed = simulatePlan({
        ...editedPlan,
        events: [{ anchor, operations: [{ ...edited, duration }] }, trigger]
      });
      expect(changed.records.some((record) => record.id === id)).toBe(false);
      expect(changed.diagnostics.some((item) => item.code === 'unreached-anchor')).toBe(true);
    }
    const deleted = simulatePlan({ ...editedPlan, events: [trigger] });
    expect(deleted.snapshots[0].queue.every((entry) => entry.modifiers.length === 0)).toBe(true);
    expect(deleted.records.some((record) => record.id === id)).toBe(false);
    expect(deleted.diagnostics.some((item) => item.code === 'unreached-anchor')).toBe(true);
    expect(editedPlan.events[1]).toEqual(trigger);
    expect(simulatePlan(editedPlan).records.some((record) => record.id === id)).toBe(true);
  });
});
