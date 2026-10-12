import { anchorKey, countdownParticipantId, HARD_LIMITS, spawnedParticipantId } from './queue';
import { targetIds, validTargetSelection } from './targeting';
import type {
  Diagnostic,
  EffectOperation,
  EventAnchor,
  ParticipantDefinition,
  ParticipantInfo,
  SimulationPlan
} from './types';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const oneOf = (value: unknown, choices: readonly string[]): value is string =>
  typeof value === 'string' && choices.includes(value);
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function validDefinition(value: unknown): value is ParticipantDefinition {
  if (
    !object(value) ||
    !identity(value.name) ||
    (value.iconUrl !== undefined && typeof value.iconUrl !== 'string') ||
    (value.initialAG !== undefined &&
      (typeof value.initialAG !== 'number' ||
        !Number.isFinite(value.initialAG) ||
        value.initialAG < 0))
  )
    return false;
  if (value.kind === 'scheduledEvent') return positive(value.speed);
  return (
    value.kind === 'actor' &&
    oneOf(value.camp, ['ally', 'enemy']) &&
    positive(value.baseSpeed) &&
    positive(value.panelSpeed) &&
    (value.actionLimit == null || count(value.actionLimit)) &&
    (value.category === undefined ||
      oneOf(value.category, ['character', 'enemy', 'summon', 'memosprite', 'custom']))
  );
}
export function validAnchor(value: unknown): value is EventAnchor {
  return (
    object(value) &&
    (value.kind === 'start' ||
      ((value.kind === 'action' || value.kind === 'trigger') &&
        identity(value.participantId) &&
        (value.kind === 'trigger' || count(value.turn))))
  );
}
export function validateOperations(
  operations: readonly EffectOperation[],
  anchor: EventAnchor
): Diagnostic[] {
  const invalid = (operationId?: string): Diagnostic[] => [
    { code: 'invalid-input', severity: 'error', anchor, operationId }
  ];
  if (!Array.isArray(operations)) return invalid();
  const ids = new Set<string>();
  for (const op of operations) {
    if (!object(op) || !identity(op.id) || ids.has(op.id)) return invalid();
    ids.add(op.id);
    if (
      anchor.kind === 'action'
        ? !oneOf(op.phase, ['preAction', 'postAction'])
        : op.phase !== undefined
    )
      return invalid(op.id);
    if (op.type === 'spawnParticipant') {
      if (!validDefinition(op.participant)) return invalid(op.id);
      continue;
    }
    if (
      !oneOf(op.type, ['advance', 'delay', 'immediatelyAct', 'addSpeedModifier']) ||
      !object(op.target) ||
      !oneOf(op.target.kind, ['participants', 'allies', 'enemies'])
    )
      return invalid(op.id);
    if (
      op.target.kind === 'participants' &&
      (!Array.isArray(op.target.participantIds) ||
        !op.target.participantIds.length ||
        !op.target.participantIds.every(identity) ||
        new Set(op.target.participantIds).size !== op.target.participantIds.length)
    )
      return invalid(op.id);
    if (
      (op.type === 'advance' || op.type === 'delay') &&
      (typeof op.percent !== 'number' || !Number.isFinite(op.percent) || op.percent < 0)
    )
      return invalid(op.id);
    if (op.type === 'addSpeedModifier') {
      if (
        !oneOf(op.mode, ['flat', 'percent']) ||
        typeof op.amount !== 'number' ||
        !Number.isFinite(op.amount) ||
        !object(op.duration)
      )
        return invalid(op.id);
      if (
        op.duration.kind === 'turns'
          ? op.duration.turns !== null && !count(op.duration.turns)
          : op.duration.kind !== 'countdown' ||
            !identity(op.duration.name) ||
            !positive(op.duration.speed)
      )
        return invalid(op.id);
    }
  }
  return [];
}
/** Includes uncreated/retired definitions for orphan labels, never for runtime targeting. */
export function participantCatalog(plan: SimulationPlan): ParticipantInfo[] {
  const info = (id: string, definition: ParticipantDefinition): ParticipantInfo => ({
    id,
    kind: definition.kind,
    name: definition.name,
    iconUrl: definition.iconUrl,
    ...(definition.kind === 'actor' ? { camp: definition.camp } : {})
  });
  return [
    ...plan.actors.map((actor) => info(actor.id, actor)),
    ...plan.events.flatMap((event) =>
      event.operations.flatMap((op) =>
        op.type === 'spawnParticipant'
          ? [info(spawnedParticipantId(op.id), op.participant)]
          : op.type === 'addSpeedModifier' && op.duration.kind === 'countdown'
            ? [
                {
                  id: countdownParticipantId(op.id),
                  kind: 'scheduledEvent' as const,
                  name: op.duration.name
                }
              ]
            : []
      )
    )
  ];
}
export function validatePlan(plan: SimulationPlan): Diagnostic[] {
  const invalid = (): Diagnostic[] => [{ code: 'invalid-input', severity: 'error' }];
  if (
    !object(plan) ||
    !Array.isArray(plan.actors) ||
    !Array.isArray(plan.events) ||
    !count(plan.maxNodes) ||
    plan.maxNodes > HARD_LIMITS.maxNodes ||
    !positive(plan.maxAV) ||
    plan.maxAV > HARD_LIMITS.maxAV
  )
    return invalid();
  const positions = new Set<string>();
  for (const actor of plan.actors) {
    if (
      !validDefinition(actor) ||
      actor.kind !== 'actor' ||
      !identity(actor.id) ||
      !Number.isSafeInteger(actor.position) ||
      actor.position < 0
    )
      return invalid();
    const position = `${actor.camp}:${actor.position}`;
    if (positions.has(position)) return invalid();
    positions.add(position);
  }
  const anchors = new Set<string>();
  const operationIds = new Set<string>();
  for (const event of plan.events) {
    if (!object(event) || !validAnchor(event.anchor) || anchors.has(anchorKey(event.anchor)))
      return invalid();
    anchors.add(anchorKey(event.anchor));
    const errors = validateOperations(event.operations, event.anchor);
    if (errors.length) return errors;
    for (const op of event.operations) {
      if (operationIds.has(op.id)) return invalid();
      operationIds.add(op.id);
    }
  }
  const catalog = participantCatalog(plan);
  const participants = new Map<string, ParticipantInfo>();
  for (const participant of catalog) {
    if (participants.has(participant.id))
      return [{ code: 'duplicate-participant', severity: 'error', participantId: participant.id }];
    participants.set(participant.id, participant);
  }
  for (const event of plan.events) {
    if (event.anchor.kind !== 'start') {
      const source = participants.get(event.anchor.participantId);
      if (source && (source.kind === 'actor') !== (event.anchor.kind === 'action'))
        return invalid();
    }
    for (const op of event.operations) {
      if (op.type === 'spawnParticipant') continue;
      const ids = targetIds(op.target, catalog);
      const known = ids.flatMap((id) => (participants.get(id) ? [participants.get(id)!] : []));
      if (
        known.some((participant) => participant.kind === 'scheduledEvent') &&
        (ids.length !== 1 || !validTargetSelection(op.type, known))
      )
        return [
          { code: 'invalid-target', severity: 'error', anchor: event.anchor, operationId: op.id }
        ];
    }
  }
  return [];
}
