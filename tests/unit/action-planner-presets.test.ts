import { describe, expect, it } from 'vitest';
import { canUseVonwacq, presetOperation } from '../../src/lib/action-planner/presets';
import { simulatePlan } from '../../src/lib/action-planner/engine';
import type { SimulationPlan } from '../../src/lib/action-planner/types';

describe('action planner form presets', () => {
  it.each([
    ['vonwacq', 40, { kind: 'units', unitIds: ['unit'] }],
    ['eagle', 25, { kind: 'units', unitIds: ['unit'] }],
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
    expect(canUseVonwacq({ kind: 'action', unitId: 'unit', turn: 1 })).toBe(false);
    // The same template executes at a speed below the former 120 SPD threshold.
    const result = simulatePlan({
      units: [
        {
          id: 'unit',
          name: 'synthetic',
          camp: 'ally',
          position: 0,
          baseSpeed: 100,
          panelSpeed: 100
        }
      ],
      events: [
        { anchor: { kind: 'start' }, operations: [presetOperation('vonwacq', 'id', 'unit')] }
      ],
      maxActions: 1,
      maxAV: 600
    });
    expect(result.records[0].elapsedAV).toBe(60);
  });

  it.each([16, 18, 20, 22])(
    'preserves submitted legacy ordinary events with %i%% advance',
    (percent) => {
      const input: SimulationPlan = JSON.parse(
        JSON.stringify({
          units: [
            {
              id: 'unit',
              name: 'synthetic',
              camp: 'ally',
              position: 0,
              baseSpeed: 100,
              panelSpeed: 100
            }
          ],
          events: [
            {
              anchor: { kind: 'start' },
              operations: [{ id: 'old', type: 'advance', target: { kind: 'allies' }, percent }]
            }
          ],
          maxActions: 1,
          maxAV: 600
        })
      );
      const original = structuredClone(input);
      const result = simulatePlan(input);
      presetOperation('dance', 'new', 'unit');
      expect(input).toEqual(original);
      expect(simulatePlan(input)).toEqual(result);
      expect(result.records[0].elapsedAV).toBeCloseTo(100 - percent, 12);
    }
  );
});
