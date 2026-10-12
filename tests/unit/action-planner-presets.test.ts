import { describe, expect, it } from 'vitest';
import { canUseVonwacq, presetOperation } from '../../src/lib/action-planner/presets';
import { simulatePlan } from '../../src/lib/action-planner/engine';

describe('action planner form presets', () => {
  it.each([
    ['vonwacq', 40, { kind: 'participants', participantIds: ['unit'] }],
    ['eagle', 25, { kind: 'participants', participantIds: ['unit'] }],
    ['dance', 24, { kind: 'allies' }]
  ] as const)('creates a standard fixed %s advance operation', (kind, percent, target) => {
    expect(presetOperation(kind, 'id', 'unit')).toEqual({
      id: 'id',
      type: 'advance',
      target,
      percent
    });
  });

  it('limits Vonwacq only to battle start, without accepting or reading speed', () => {
    expect(canUseVonwacq({ kind: 'start' })).toBe(true);
    expect(canUseVonwacq({ kind: 'action', participantId: 'unit', turn: 1 })).toBe(false);
    // The same template executes at a speed below the former 120 SPD threshold.
    const result = simulatePlan({
      actors: [
        {
          id: 'unit',
          name: 'synthetic',
          kind: 'actor',
          camp: 'ally',
          position: 0,
          baseSpeed: 100,
          panelSpeed: 100
        }
      ],
      events: [
        { anchor: { kind: 'start' }, operations: [presetOperation('vonwacq', 'id', 'unit')] }
      ],
      maxNodes: 1,
      maxAV: 600
    });
    expect(result.records[0].elapsedAV).toBe(60);
  });
});
