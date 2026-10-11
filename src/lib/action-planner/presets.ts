import type { EffectOperation, EventAnchor } from './types';

export type PresetKind = 'vonwacq' | 'eagle' | 'dance';
/** Form templates only. No preset identity is included in the engine operation. */
export function presetOperation(
  kind: PresetKind,
  id: string,
  unitId: string,
  superimposition: number
): EffectOperation {
  return {
    id,
    type: 'advance',
    target: kind === 'dance' ? { kind: 'allies' } : { kind: 'units', unitIds: [unitId] },
    percent: kind === 'vonwacq' ? 40 : kind === 'eagle' ? 25 : 14 + 2 * superimposition
  };
}
export function canUseVonwacq(anchor: EventAnchor, panelSpeed: number | undefined): boolean {
  return (
    anchor.kind === 'start' &&
    panelSpeed !== undefined &&
    Number.isFinite(panelSpeed) &&
    panelSpeed >= 120
  );
}
