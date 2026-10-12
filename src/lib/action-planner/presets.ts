import type { EffectOperation, EventAnchor } from './types';

export type PresetKind = 'vonwacq' | 'eagle' | 'dance';
/** Form templates only. No preset identity is included in the engine operation. */
export function presetOperation(
  kind: PresetKind,
  id: string,
  participantId: string
): EffectOperation {
  return {
    id,
    type: 'advance',
    target:
      kind === 'dance'
        ? { kind: 'allies' }
        : { kind: 'participants', participantIds: [participantId] },
    percent: kind === 'vonwacq' ? 40 : kind === 'eagle' ? 25 : 24
  };
}
export function canUseVonwacq(anchor: EventAnchor): boolean {
  return anchor.kind === 'start';
}
