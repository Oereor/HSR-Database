import { describe, expect, it } from 'vitest';
import { canUseVonwacq, presetOperation } from '../../src/lib/action-planner/presets';

describe('action planner form presets', () => {
  it('creates ordinary operations, with no equipment flags, at all five superimpositions', () => {
    expect(presetOperation('vonwacq', 'id', 'unit', 1)).toEqual({
      id: 'id',
      type: 'advance',
      target: { kind: 'units', unitIds: ['unit'] },
      percent: 40
    });
    expect(presetOperation('eagle', 'id', 'unit', 1)).toMatchObject({ percent: 25 });
    for (const [index, percent] of [16, 18, 20, 22, 24].entries()) {
      const op = presetOperation('dance', 'id', 'unit', index + 1);
      expect(op).toEqual({ id: 'id', type: 'advance', target: { kind: 'allies' }, percent });
    }
  });
  it('limits Vonwacq availability to battle start and the panel SPD threshold', () => {
    expect(canUseVonwacq({ kind: 'start' }, 120)).toBe(true);
    for (const speed of [119.99, undefined, NaN])
      expect(canUseVonwacq({ kind: 'start' }, speed)).toBe(false);
    expect(canUseVonwacq({ kind: 'action', unitId: 'unit', turn: 1 }, 160)).toBe(false);
  });
});
