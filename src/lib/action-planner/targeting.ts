import type { ParticipantInfo, Target, TargetedOperation } from './types';

export function targetIds(target: Target, participants: readonly ParticipantInfo[]): string[] {
  return target.kind === 'participants'
    ? [...target.participantIds]
    : participants
        .filter(
          (participant) =>
            participant.kind === 'actor' &&
            participant.camp === (target.kind === 'allies' ? 'ally' : 'enemy')
        )
        .map((participant) => participant.id);
}
/** Shared engine / picker contract. A countdown is an explicit gauge-only singleton. */
export function validTargetSelection(
  type: TargetedOperation['type'],
  participants: readonly ParticipantInfo[]
): boolean {
  return (
    participants.length > 0 &&
    (participants.every((participant) => participant.kind === 'actor') ||
      (participants.length === 1 && (type === 'advance' || type === 'delay')))
  );
}
export function selectableTargets(
  type: TargetedOperation['type'],
  participants: readonly ParticipantInfo[],
  selectedIds: readonly string[]
): ParticipantInfo[] {
  return participants.filter((candidate) =>
    validTargetSelection(type, [
      ...participants.filter(
        (participant) => selectedIds.includes(participant.id) && participant.id !== candidate.id
      ),
      candidate
    ])
  );
}
