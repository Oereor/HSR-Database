import type {
  Diagnostic,
  DiagnosticCode,
  EventAnchor,
  ParticipantState,
  QueueSnapshot,
  SimulationState
} from './types';

export const FULL_AG = 10000;
export const DEFAULT_LIMITS = { maxNodes: 60, maxAV: 600 } as const;
export const HARD_LIMITS = { maxNodes: 500, maxAV: 100000 } as const;
export const anchorKey = (anchor: EventAnchor): string =>
  anchor.kind === 'start'
    ? 'start'
    : anchor.kind === 'trigger'
      ? `trigger:${encodeURIComponent(anchor.participantId)}`
      : `action:${encodeURIComponent(anchor.participantId)}:${anchor.turn}`;
export const spawnedParticipantId = (operationId: string): string =>
  `spawn:${encodeURIComponent(operationId)}`;
export const countdownParticipantId = (operationId: string): string =>
  `countdown:${encodeURIComponent(operationId)}`;
export const modifierId = (operationId: string, participantId: string): string =>
  `${encodeURIComponent(operationId)}::${encodeURIComponent(participantId)}`;
export class SimulationError extends Error {
  constructor(public diagnostic: Diagnostic) {
    super(diagnostic.code);
  }
}
export function fail(code: DiagnosticCode, participantId?: string): never {
  throw new SimulationError({
    code,
    severity: 'error',
    ...(participantId ? { participantId } : {})
  });
}
export function finite(value: number): number {
  if (!Number.isFinite(value)) fail('non-finite');
  return value;
}
export function effectiveSpeed(participant: ParticipantState): number {
  const speed = finite(
    participant.kind === 'scheduledEvent'
      ? participant.speed
      : participant.panelSpeed +
          participant.modifiers.reduce(
            (sum, buff) =>
              finite(
                sum +
                  (buff.mode === 'flat' ? buff.amount : (participant.baseSpeed * buff.amount) / 100)
              ),
            0
          )
  );
  if (speed <= 0) fail('invalid-speed', participant.id);
  return speed;
}
export function cloneState(state: SimulationState): SimulationState {
  return {
    ...state,
    issuedParticipantIds: new Set(state.issuedParticipantIds),
    participants: state.participants.map((participant) =>
      participant.kind === 'actor'
        ? {
            ...participant,
            modifiers: participant.modifiers.map((buff) => ({
              ...buff,
              lifetime: { ...buff.lifetime }
            }))
          }
        : { ...participant }
    )
  };
}
export function orderedParticipants(state: SimulationState): ParticipantState[] {
  return state.participants
    .filter((participant) => participant.id !== state.activeParticipantId)
    .sort((a, b) => {
      const difference = a.remainingAG / effectiveSpeed(a) - b.remainingAG / effectiveSpeed(b);
      if (difference !== 0) return difference;
      if (a.remainingAG === 0 && b.remainingAG === 0) {
        if (a.zeroBatch !== b.zeroBatch) return b.zeroBatch - a.zeroBatch;
        if (a.zeroBatch && a.zeroOrder !== b.zeroOrder) return a.zeroOrder - b.zeroOrder;
      }
      return a.order - b.order;
    });
}
export function nextAnchor(participant: ParticipantState): Exclude<EventAnchor, { kind: 'start' }> {
  return participant.kind === 'actor'
    ? { kind: 'action', participantId: participant.id, turn: participant.turns + 1 }
    : { kind: 'trigger', participantId: participant.id };
}
export function queueSnapshot(state: SimulationState): QueueSnapshot {
  return {
    elapsedAV: state.elapsedAV,
    completedNodes: state.completedNodes,
    completedActions: state.completedActions,
    queue: orderedParticipants(state).map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      name: participant.name,
      iconUrl: participant.iconUrl,
      ...(participant.kind === 'actor' ? { camp: participant.camp } : {}),
      anchor: nextAnchor(participant),
      remainingAG: participant.remainingAG,
      remainingAV: finite(participant.remainingAG / effectiveSpeed(participant)),
      effectiveSpeed: effectiveSpeed(participant),
      modifiers:
        participant.kind === 'actor'
          ? participant.modifiers.map((buff) => ({ ...buff, lifetime: { ...buff.lifetime } }))
          : []
    }))
  };
}
export function assertState(state: SimulationState): void {
  for (const participant of state.participants)
    finite(participant.remainingAG / effectiveSpeed(participant));
}
/** Only normalize subtraction roundoff; never use an AV ordering epsilon. */
export function advanceTime(state: SimulationState, deltaAV: number): void {
  state.elapsedAV = finite(state.elapsedAV + deltaAV);
  for (const participant of state.participants) {
    const consumed = finite(deltaAV * effectiveSpeed(participant));
    const residual = participant.remainingAG - consumed;
    const tolerance = Number.EPSILON * 8 * Math.max(FULL_AG, participant.remainingAG, consumed);
    participant.remainingAG = residual <= tolerance ? 0 : residual;
    if (participant.remainingAG > 0) {
      participant.zeroBatch = 0;
      participant.zeroOrder = 0;
    }
  }
}
