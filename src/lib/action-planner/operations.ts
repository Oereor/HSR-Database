import {
  assertState,
  cloneState,
  countdownParticipantId,
  effectiveSpeed,
  fail,
  finite,
  FULL_AG,
  modifierId,
  nextAnchor,
  orderedParticipants,
  SimulationError,
  spawnedParticipantId
} from './queue';
import { targetIds, validTargetSelection } from './targeting';
import { validateOperations } from './validation';
import type {
  Diagnostic,
  ActionChangeTrace,
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
    zeroOrder: 0,
    pendingActionChanges: [] as ActionChangeTrace[]
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
          const originalOrder = orderedParticipants(next);
          const group = originalOrder.filter((participant) => ids.includes(participant.id));
          const changes: ActionChangeTrace[] =
            op.type === 'immediatelyAct'
              ? []
              : group.map((participant) => ({
                  operationId: op.id,
                  sourceAnchor: { ...anchor },
                  phase: op.phase,
                  targetAnchor: nextAnchor(participant),
                  elapsedAV: next.elapsedAV,
                  type: op.type as 'advance' | 'delay',
                  beforeAG: participant.remainingAG,
                  afterAG: participant.remainingAG,
                  effectiveSpeed: effectiveSpeed(participant),
                  deltaAV: 0,
                  zeroAVInsertion: false
                }));
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
          // Trace the same candidate state that will commit, without changing queue mathematics.
          const committedOrder = changes.length ? orderedParticipants(next) : [];
          for (const change of changes) {
            const participant = group.find(
              (entry) => entry.id === change.targetAnchor.participantId
            )!;
            change.afterAG = participant.remainingAG;
            change.deltaAV = (change.afterAG - change.beforeAG) / change.effectiveSpeed;
            change.zeroAVInsertion =
              op.type === 'advance' &&
              op.percent > 0 &&
              change.beforeAG === 0 &&
              change.afterAG === 0 &&
              committedOrder.indexOf(participant) < originalOrder.indexOf(participant);
            participant.pendingActionChanges.push(change);
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
