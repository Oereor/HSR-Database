import type {
  ActionChangeTrace,
  EffectOperation,
  EventAnchor,
  NodeAnchor,
  NodeRecord,
  ParticipantInfo,
  QueueEntry,
  SpeedModifierInstance
} from './types';
import { phaseOperations } from './effect-config';
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime.js';

/** Round only for display; suppress the sign when Intl rounds a value to zero. */
export function formatAV(value: number, locale: Locale, signed = false): string {
  const options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const plain = new Intl.NumberFormat(locale, options);
  const displayed = plain.formatToParts(Math.abs(value));
  const roundsToZero = displayed
    .filter((part) => part.type === 'integer' || part.type === 'fraction')
    .every((part) => /^0+$/.test(part.value));
  return new Intl.NumberFormat(locale, {
    ...options,
    signDisplay: signed ? 'exceptZero' : 'auto'
  }).format(roundsToZero ? 0 : value);
}

export function orderedCardOperations(
  operations: readonly EffectOperation[],
  anchor: EventAnchor
): EffectOperation[] {
  return anchor.kind === 'action'
    ? [...phaseOperations(operations, 'preAction'), ...phaseOperations(operations, 'postAction')]
    : [...operations];
}

export function operationTitle(operation: EffectOperation, locale: Locale): string {
  switch (operation.type) {
    case 'advance':
      return m.planner_advance({}, { locale });
    case 'delay':
      return m.planner_delay({}, { locale });
    case 'immediatelyAct':
      return m.planner_card_immediate({}, { locale });
    case 'addSpeedModifier':
      return operation.amount >= 0
        ? m.planner_speed_up({}, { locale })
        : m.planner_speed_down({}, { locale });
    case 'spawnParticipant':
      return operation.participant.kind === 'actor'
        ? m.planner_create_actor({}, { locale })
        : m.planner_create_event({}, { locale });
  }
}

type ParticipantCard = {
  anchor: NodeAnchor;
  name: string;
  iconUrl?: string;
  effectiveSpeed: number;
  actionChanges: ActionChangeTrace[];
};
export type ActionCardData =
  | (ParticipantCard & { kind: 'future'; elapsedAV: number; deltaAV: number })
  | (ParticipantCard & { kind: 'queue'; remainingAV: number; modifiers: SpeedModifierInstance[] })
  | {
      kind: 'system';
      anchor: Extract<EventAnchor, { kind: 'start' }>;
      name: string;
      elapsedAV: number;
    };
export function futureActionCard(record: NodeRecord): ActionCardData {
  return {
    kind: 'future',
    anchor: record.anchor,
    name: record.name,
    iconUrl: record.iconUrl,
    effectiveSpeed: record.effectiveSpeed,
    actionChanges: record.actionChanges,
    elapsedAV: record.elapsedAV,
    deltaAV: record.deltaAV
  };
}
export function queueActionCard(entry: QueueEntry): ActionCardData {
  return {
    kind: 'queue',
    anchor: entry.anchor,
    name: entry.name,
    iconUrl: entry.iconUrl,
    effectiveSpeed: entry.effectiveSpeed,
    actionChanges: entry.actionChanges,
    remainingAV: entry.remainingAV,
    modifiers: entry.modifiers
  };
}

export type ParticipantLabels = ReadonlyMap<string, string>;
/** Labels use the complete catalog, never current queue positions or targeting eligibility. */
export function participantLabels(
  catalog: readonly ParticipantInfo[],
  duplicate: (name: string, index: number) => string
): ParticipantLabels {
  const groups = new Map<string, ParticipantInfo[]>();
  for (const participant of catalog) {
    const group = groups.get(participant.name) ?? [];
    group.push(participant);
    groups.set(participant.name, group);
  }
  const labels = new Map<string, string>();
  for (const [name, group] of groups) {
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    group.forEach((participant, index) =>
      labels.set(participant.id, group.length > 1 ? duplicate(name, index + 1) : name)
    );
  }
  return labels;
}
