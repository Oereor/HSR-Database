import { phaseOperations } from './effect-config';
import { applyOperations, spawnParticipant } from './operations';
import {
  advanceTime,
  assertState,
  cloneState,
  effectiveSpeed,
  fail,
  finite,
  FULL_AG,
  nextAnchor,
  orderedParticipants,
  queueSnapshot,
  anchorKey,
  SimulationError
} from './queue';
import { participantCatalog, validateOperations, validatePlan } from './validation';
import type {
  ActorState,
  Diagnostic,
  EffectOperation,
  EventAnchor,
  NodeRecord,
  SimulationPlan,
  SimulationResult,
  SimulationState
} from './types';

export { applyOperations } from './operations';
export {
  anchorKey,
  cloneState,
  countdownParticipantId,
  DEFAULT_LIMITS,
  effectiveSpeed,
  FULL_AG,
  HARD_LIMITS,
  modifierId,
  nextAnchor,
  orderedParticipants,
  queueSnapshot,
  spawnedParticipantId
} from './queue';
export { participantCatalog, validateOperations, validatePlan } from './validation';

export function createInitialState(plan: SimulationPlan): SimulationState {
  const errors = validatePlan(plan);
  if (errors.length) throw new SimulationError(errors[0]);
  const state: SimulationState = {
    participants: [],
    elapsedAV: 0,
    completedNodes: 0,
    completedActions: 0,
    batch: 0,
    nextOrder: 0,
    issuedParticipantIds: new Set()
  };
  const actors = [...plan.actors].sort(
    (a, b) =>
      (a.camp === b.camp ? 0 : a.camp === 'ally' ? -1 : 1) ||
      a.position - b.position ||
      a.id.localeCompare(b.id)
  );
  for (const actor of actors) spawnParticipant(state, actor.id, actor);
  return state;
}
function settleActor(state: SimulationState, id: string, oldModifiers: ReadonlySet<string>): void {
  const actor = state.participants.find(
    (participant): participant is ActorState =>
      participant.id === id && participant.kind === 'actor'
  )!;
  actor.modifiers = actor.modifiers.filter((buff) => {
    if (buff.lifetime.kind === 'countdown' || buff.lifetime.remainingTurns === null) return true;
    if (oldModifiers.has(buff.id)) buff.lifetime.remainingTurns--;
    return buff.lifetime.remainingTurns > 0;
  });
  // Do not reset AG or insertion priority during expiry.
  assertState(state);
  if (actor.actionLimit != null && actor.turns >= actor.actionLimit)
    state.participants = state.participants.filter((participant) => participant.id !== id);
  state.completedActions++;
}
function expireCountdown(state: SimulationState, id: string): void {
  for (const participant of state.participants)
    if (participant.kind === 'actor')
      participant.modifiers = participant.modifiers.filter(
        (buff) => buff.lifetime.kind !== 'countdown' || buff.lifetime.participantId !== id
      );
  // Invalid expiry stops this node before its operations can mask the failure.
  assertState(state);
}
export function stepSimulation(
  input: SimulationState,
  operations: readonly EffectOperation[]
): { state: SimulationState; record: NodeRecord; diagnostics: Diagnostic[] } {
  let state = cloneState(input);
  const active = orderedParticipants(state)[0];
  if (!active) fail('invalid-input');
  const anchor = nextAnchor(active);
  const errors = validateOperations(operations, anchor);
  if (errors.length) throw new SimulationError(errors[0]);
  const speed = effectiveSpeed(active);
  const deltaAV = finite(active.remainingAG / speed);
  const oldModifiers = new Set(
    active.kind === 'actor' ? active.modifiers.map((buff) => buff.id) : []
  );
  advanceTime(state, deltaAV);
  active.remainingAG = 0;
  state.activeParticipantId = active.id;
  try {
    if (active.kind === 'scheduledEvent') expireCountdown(state, active.id);
    const record: NodeRecord = {
      id: active.id,
      kind: active.kind,
      name: active.name,
      iconUrl: active.iconUrl,
      ...(active.kind === 'actor' ? { camp: active.camp } : {}),
      anchor,
      elapsedAV: state.elapsedAV,
      deltaAV,
      effectiveSpeed: speed,
      beforeEffects: cloneState(state)
    };
    let diagnostics: Diagnostic[];
    if (active.kind === 'actor') {
      const before = applyOperations(state, phaseOperations(operations, 'preAction'), anchor);
      state = before.state;
      const actor = state.participants.find(
        (participant): participant is ActorState =>
          participant.id === active.id && participant.kind === 'actor'
      )!;
      actor.turns++;
      actor.remainingAG = FULL_AG;
      actor.zeroBatch = 0;
      actor.zeroOrder = 0;
      delete state.activeParticipantId;
      const after = applyOperations(state, phaseOperations(operations, 'postAction'), anchor);
      state = after.state;
      settleActor(state, active.id, oldModifiers);
      diagnostics = [...before.diagnostics, ...after.diagnostics];
    } else {
      const triggered = applyOperations(state, operations, anchor);
      state = triggered.state;
      state.participants = state.participants.filter((participant) => participant.id !== active.id);
      delete state.activeParticipantId;
      diagnostics = triggered.diagnostics;
    }
    state.completedNodes++;
    return { state, record, diagnostics };
  } catch (error) {
    if (error instanceof SimulationError)
      throw new SimulationError({ ...error.diagnostic, anchor });
    throw error;
  }
}
export function simulatePlan(plan: SimulationPlan): SimulationResult {
  const result: SimulationResult = {
    records: [],
    snapshots: [],
    participants: [],
    diagnostics: validatePlan(plan),
    stopReason: 'error'
  };
  if (result.diagnostics.length) return result;
  result.participants = participantCatalog(plan);
  const reached = new Set<string>();
  const events = new Map(plan.events.map((event) => [anchorKey(event.anchor), event.operations]));
  try {
    let state = createInitialState(plan);
    result.startState = cloneState(state);
    reached.add('start');
    const initial = applyOperations(state, events.get('start') ?? [], { kind: 'start' });
    state = initial.state;
    result.diagnostics.push(...initial.diagnostics);
    result.snapshots.push(queueSnapshot(state));
    result.stopReason = 'nodes';
    if (!state.participants.length)
      result.diagnostics.push({ code: 'no-participants', severity: 'info' });
    while (state.participants.length && state.completedNodes < plan.maxNodes) {
      const next = orderedParticipants(state)[0];
      if (finite(state.elapsedAV + next.remainingAG / effectiveSpeed(next)) > plan.maxAV) {
        result.stopReason = 'av';
        break;
      }
      const anchor = nextAnchor(next);
      const step = stepSimulation(state, events.get(anchorKey(anchor)) ?? []);
      const snapshot = queueSnapshot(step.state);
      state = step.state;
      reached.add(anchorKey(anchor));
      result.records.push(step.record);
      result.snapshots.push(snapshot);
      result.diagnostics.push(...step.diagnostics);
    }
    if (!state.participants.length) result.stopReason = 'empty';
  } catch (error) {
    if (!(error instanceof SimulationError)) throw error;
    result.stopReason = 'error';
    result.diagnostics.push(error.diagnostic);
  }
  for (const event of plan.events)
    if (event.operations.length && !reached.has(anchorKey(event.anchor)))
      result.diagnostics.push({
        code: 'unreached-anchor',
        severity: 'warning',
        anchor: event.anchor
      });
  return result;
}

/** Replay only the operations preceding a draft, using the same engine as execution. */
export function previewOperationState(
  input: SimulationState,
  operations: readonly EffectOperation[],
  anchor: EventAnchor,
  phase: 'preAction' | 'postAction',
  beforeId?: string
): SimulationState | undefined {
  try {
    let state = cloneState(input);
    if (anchor.kind === 'action' && phase === 'postAction') {
      state = applyOperations(state, phaseOperations(operations, 'preAction'), anchor).state;
      const actor = state.participants.find(
        (participant): participant is ActorState =>
          participant.id === anchor.participantId && participant.kind === 'actor'
      );
      if (!actor) return undefined;
      actor.turns++;
      actor.remainingAG = FULL_AG;
      actor.zeroBatch = 0;
      actor.zeroOrder = 0;
      delete state.activeParticipantId;
    }
    const group = anchor.kind === 'action' ? phaseOperations(operations, phase) : [...operations];
    const index =
      beforeId === undefined ? group.length : group.findIndex((op) => op.id === beforeId);
    return applyOperations(state, group.slice(0, index < 0 ? group.length : index), anchor).state;
  } catch (error) {
    if (error instanceof SimulationError) return undefined;
    throw error;
  }
}
