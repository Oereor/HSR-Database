import type {
  EffectOperation,
  EventAnchor,
  NodeAnchor,
  NodeRecord,
  ParticipantInfo,
  QueueEntry,
  SpeedModifierInstance
} from './types';

type ParticipantCard = {
  anchor: NodeAnchor;
  name: string;
  iconUrl?: string;
  effectiveSpeed: number;
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
export type EffectSummary = {
  kind: 'advance' | 'delay' | 'immediatelyAct' | 'speed' | 'spawnParticipant' | 'mixed';
  count: number;
};
export function summarizeEffects(
  operations: readonly EffectOperation[]
): EffectSummary | undefined {
  if (!operations.length) return undefined;
  const family = (operation: EffectOperation): Exclude<EffectSummary['kind'], 'mixed'> =>
    operation.type === 'addSpeedModifier' ? 'speed' : operation.type;
  const first = family(operations[0]);
  return {
    kind: operations.every((operation) => family(operation) === first) ? first : 'mixed',
    count: operations.length
  };
}
export function futureActionCard(record: NodeRecord): ActionCardData {
  return {
    kind: 'future',
    anchor: record.anchor,
    name: record.name,
    iconUrl: record.iconUrl,
    effectiveSpeed: record.effectiveSpeed,
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
