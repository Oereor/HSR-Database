import type { SpeedDuration } from './types';

export interface SpeedDurationDraft {
  kind: SpeedDuration['kind'];
  turns: string;
  countdownName: string;
  countdownSpeed: number | undefined;
}
export type SpeedDurationField = 'turns' | 'countdownName' | 'countdownSpeed';
export function speedDurationDraft(duration?: SpeedDuration): SpeedDurationDraft {
  return {
    kind: duration?.kind ?? 'turns',
    turns:
      duration?.kind === 'turns' ? (duration.turns === null ? '' : String(duration.turns)) : '2',
    countdownName: duration?.kind === 'countdown' ? duration.name : '',
    countdownSpeed: duration?.kind === 'countdown' ? duration.speed : 70
  };
}
/** Parse only the selected mode; hidden fields remain an unsubmitted draft. */
export function parseSpeedDuration(draft: SpeedDurationDraft): {
  duration?: SpeedDuration;
  invalid: SpeedDurationField[];
} {
  if (draft.kind === 'turns') {
    const text = draft.turns.trim();
    const turns = text === '' ? null : Number(text);
    return turns !== null && (!/^\d+$/.test(text) || !Number.isSafeInteger(turns) || turns < 1)
      ? { invalid: ['turns'] }
      : { duration: { kind: 'turns', turns }, invalid: [] };
  }
  const invalid: SpeedDurationField[] = [];
  const name = draft.countdownName.trim();
  if (!name) invalid.push('countdownName');
  const speed = draft.countdownSpeed;
  if (speed === undefined || !Number.isFinite(speed) || speed <= 0) invalid.push('countdownSpeed');
  return invalid.length
    ? { invalid }
    : { duration: { kind: 'countdown', name, speed: speed! }, invalid: [] };
}
