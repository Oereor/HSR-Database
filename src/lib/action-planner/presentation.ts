import type {
  ActionRecord,
  EffectOperation,
  EventAnchor,
  QueueEntry,
  SpeedModifierInstance
} from './types';

type ActionAnchor = Extract<EventAnchor, { kind: 'action' }>;
type UnitCard = { anchor: ActionAnchor; name: string; effectiveSpeed: number };

export type ActionCardData =
  | (UnitCard & { kind: 'future'; elapsedAV: number; deltaAV: number })
  | (UnitCard & {
      kind: 'queue';
      remainingAV: number;
      modifiers: SpeedModifierInstance[];
    })
  | {
      kind: 'system';
      anchor: Extract<EventAnchor, { kind: 'start' }>;
      name: string;
      elapsedAV: number;
    };

export type EffectSummary = {
  kind: 'advance' | 'delay' | 'immediatelyAct' | 'speed' | 'mixed';
  count: number;
};

export function summarizeEffects(
  operations: readonly EffectOperation[]
): EffectSummary | undefined {
  if (!operations.length) return undefined;
  const family = (operation: EffectOperation): Exclude<EffectSummary['kind'], 'mixed'> =>
    operation.type === 'addSpeedModifier' || operation.type === 'removeSpeedModifier'
      ? 'speed'
      : operation.type;
  const first = family(operations[0]);
  return {
    kind: operations.every((operation) => family(operation) === first) ? first : 'mixed',
    count: operations.length
  };
}

export function futureActionCard(record: ActionRecord, name: string): ActionCardData {
  return {
    kind: 'future',
    anchor: record.anchor,
    name,
    effectiveSpeed: record.effectiveSpeed,
    elapsedAV: record.elapsedAV,
    deltaAV: record.deltaAV
  };
}

export function queueActionCard(entry: QueueEntry): ActionCardData {
  return {
    kind: 'queue',
    anchor: { kind: 'action', unitId: entry.unitId, turn: entry.turn },
    name: entry.name,
    effectiveSpeed: entry.effectiveSpeed,
    remainingAV: entry.remainingAV,
    modifiers: entry.modifiers
  };
}
