import { validateOperations } from './validation';
import type { ActorDefinition, Camp, EffectOperation, EffectPhase, EventAnchor } from './types';

export type SpawnOperation = Extract<EffectOperation, { type: 'spawnParticipant' }>;
export type ParticipantField =
  'name' | 'baseSpeed' | 'panelSpeed' | 'speed' | 'actionLimit' | 'form';
export interface ParticipantDraft {
  kind: 'actor' | 'scheduledEvent';
  phase: EffectPhase;
  name: string;
  camp: Camp;
  category: ActorDefinition['category'] | '';
  baseSpeed: number | undefined;
  panelSpeed: number | undefined;
  speed: number | undefined;
  actionLimit: string;
}
export function participantDraft(operation?: SpawnOperation): ParticipantDraft {
  const definition = operation?.participant;
  return {
    kind: definition?.kind ?? 'actor',
    phase: operation?.phase ?? 'preAction',
    name: definition?.name ?? '',
    camp: definition?.kind === 'actor' ? definition.camp : 'ally',
    category: definition?.kind === 'actor' ? (definition.category ?? '') : 'custom',
    baseSpeed: definition?.kind === 'actor' ? definition.baseSpeed : 100,
    panelSpeed: definition?.kind === 'actor' ? definition.panelSpeed : 100,
    speed: definition?.kind === 'scheduledEvent' ? definition.speed : 100,
    actionLimit:
      definition?.kind === 'actor' && definition.actionLimit != null
        ? String(definition.actionLimit)
        : ''
  };
}
/** Draft parsing only; engine validation remains the final definition/phase authority. */
export function buildParticipantOperation(
  draft: ParticipantDraft,
  id: string,
  anchor: EventAnchor,
  original?: SpawnOperation
): { operation?: SpawnOperation; invalid: ParticipantField[] } {
  const invalid: ParticipantField[] = [];
  if (!draft.name.trim()) invalid.push('name');
  const positive = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value > 0;
  const actionLimit = draft.actionLimit.trim() === '' ? null : Number(draft.actionLimit);
  if (draft.kind === 'actor') {
    if (!positive(draft.baseSpeed)) invalid.push('baseSpeed');
    if (!positive(draft.panelSpeed)) invalid.push('panelSpeed');
    if (
      actionLimit !== null &&
      (!/^\d+$/.test(draft.actionLimit.trim()) ||
        !Number.isSafeInteger(actionLimit) ||
        actionLimit < 1)
    )
      invalid.push('actionLimit');
  } else if (!positive(draft.speed)) invalid.push('speed');
  if (original && original.participant.kind !== draft.kind) invalid.push('form');
  if (invalid.length) return { invalid };
  const retained = original
    ? { iconUrl: original.participant.iconUrl, initialAG: original.participant.initialAG }
    : {};
  const operation: SpawnOperation = {
    id: original?.id ?? id,
    type: 'spawnParticipant',
    ...(anchor.kind === 'action' ? { phase: draft.phase } : {}),
    participant:
      draft.kind === 'actor'
        ? {
            ...retained,
            kind: 'actor',
            name: draft.name.trim(),
            camp: draft.camp,
            category: draft.category || undefined,
            baseSpeed: draft.baseSpeed!,
            panelSpeed: draft.panelSpeed!,
            actionLimit
          }
        : { ...retained, kind: 'scheduledEvent', name: draft.name.trim(), speed: draft.speed! }
  };
  return validateOperations([operation], anchor).length
    ? { invalid: ['form'] }
    : { operation, invalid: [] };
}
