import {
  assertState,
  cloneState,
  countdownParticipantId,
  fail,
  finite,
  FULL_AG,
  modifierId,
  orderedParticipants,
  SimulationError,
  spawnedParticipantId
} from './queue';
import { targetIds, validTargetSelection } from './targeting';
import { validateOperations } from './validation';
import type {
  Diagnostic,
  EffectOperation,
  EventAnchor,
  ParticipantDefinition,
  SimulationState
} from './types';

/** The single creation path, also used by speed-duration countdowns. */
export function spawnParticipant(
  state: SimulationState,
  id: string,
  definition: ParticipantDefinition
): void {
  if (state.issuedParticipantIds.has(id)) fail('duplicate-participant', id);
  state.issuedParticipantIds.add(id);
  const queue = {
    id,
    remainingAG: definition.initialAG ?? FULL_AG,
    order: state.nextOrder++,
    zeroBatch: 0,
    zeroOrder: 0
  };
  state.participants.push(
    definition.kind === 'actor'
      ? { ...definition, ...queue, turns: 0, modifiers: [] }
      : { ...definition, ...queue }
  );
}
/** Operations commit separately; a speed addition and its countdown commit together. */
export function applyOperations(
  input: SimulationState,
  operations: readonly EffectOperation[],
  anchor: EventAnchor
): { state: SimulationState; diagnostics: Diagnostic[] } {
  const errors = validateOperations(operations, anchor);
  if (errors.length) throw new SimulationError(errors[0]);
  let state = cloneState(input);
  const diagnostics: Diagnostic[] = [];
  for (const op of operations) {
    const next = cloneState(state);
    try {
      if (op.type === 'spawnParticipant')
        spawnParticipant(next, spawnedParticipantId(op.id), op.participant);
      else {
        const ids = targetIds(op.target, next.participants);
        const targets = next.participants.filter((participant) => ids.includes(participant.id));
        if (!ids.length || ids.length !== targets.length) {
          diagnostics.push({
            code: 'missing-target',
            severity: 'warning',
            anchor,
            operationId: op.id
          });
          continue;
        }
        if (!validTargetSelection(op.type, targets)) {
          diagnostics.push({
            code: 'invalid-target',
            severity: 'warning',
            anchor,
            operationId: op.id
          });
          continue;
        }
        if (op.type === 'addSpeedModifier') {
          const countdownId = countdownParticipantId(op.id);
          for (const actor of targets) {
            if (actor.kind !== 'actor') fail('invalid-target', actor.id);
            actor.modifiers.push({
              id: modifierId(op.id, actor.id),
              operationId: op.id,
              mode: op.mode,
              amount: op.amount,
              lifetime:
                op.duration.kind === 'turns'
                  ? { kind: 'turns', remainingTurns: op.duration.turns }
                  : { kind: 'countdown', participantId: countdownId }
            });
          }
          if (op.duration.kind === 'countdown')
            spawnParticipant(next, countdownId, {
              kind: 'scheduledEvent',
              name: op.duration.name,
              speed: op.duration.speed
            });
        } else {
          const group = orderedParticipants(next).filter((participant) =>
            ids.includes(participant.id)
          );
          if (ids.includes(next.activeParticipantId ?? ''))
            diagnostics.push({
              code: 'active-target',
              severity: 'warning',
              anchor,
              operationId: op.id,
              participantId: next.activeParticipantId
            });
          for (const participant of group) {
            participant.remainingAG =
              op.type === 'immediatelyAct'
                ? 0
                : Math.max(
                    0,
                    finite(
                      participant.remainingAG +
                        ((op.type === 'advance' ? -1 : 1) * FULL_AG * op.percent) / 100
                    )
                  );
            if (participant.remainingAG > 0) {
              participant.zeroBatch = 0;
              participant.zeroOrder = 0;
            }
          }
          if (op.type === 'immediatelyAct' || (op.type === 'advance' && op.percent > 0)) {
            const zeros = group.filter((participant) => participant.remainingAG === 0);
            if (zeros.length) {
              next.batch++;
              zeros.forEach((participant, index) => {
                participant.zeroBatch = next.batch;
                participant.zeroOrder = index;
              });
            }
          }
        }
      }
      assertState(next);
      state = next;
    } catch (error) {
      if (error instanceof SimulationError)
        throw new SimulationError({ ...error.diagnostic, anchor, operationId: op.id });
      throw error;
    }
  }
  return { state, diagnostics };
}
