<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { previewOperationState } from '$lib/action-planner/engine';
  import { moveOperation, phaseOperations } from '$lib/action-planner/effect-config';
  import type {
    EffectOperation,
    EventAnchor,
    ParticipantInfo,
    SimulationState
  } from '$lib/action-planner/types';
  import EffectCard from './EffectCard.svelte';
  import { operationTargets } from '$lib/action-planner/targeting';
  export let locale: Locale;
  export let anchor: EventAnchor;
  export let operations: EffectOperation[];
  export let catalog: ParticipantInfo[];
  export let context: SimulationState | undefined;
  export let avatar: (id: string) => string | undefined;
  export let editingId: string | undefined;
  export let onEdit: (operation: EffectOperation) => void;
  export let onChange: (operations: EffectOperation[]) => void;
  export let onDelete: (id: string) => void;
  $: groups =
    anchor.kind !== 'action'
      ? [{ phase: undefined, operations }]
      : (['preAction', 'postAction'] as const).map((phase) => ({
          phase,
          operations: phaseOperations(operations, phase)
        }));
  function participantsBefore(operation: EffectOperation): ParticipantInfo[] {
    return operationTargets(
      context
        ? previewOperationState(
            context,
            operations,
            anchor,
            operation.phase ?? 'preAction',
            operation.id
          )
        : undefined
    );
  }
</script>

<div class="operations" data-testid="planner-operations">
  <h3>{m.planner_configured_effects({}, { locale })}</h3>
  {#each groups as group}
    <section class="effect-group" data-phase-group={group.phase ?? 'system'}>
      {#if group.phase}<h4>
          {group.phase === 'preAction'
            ? m.planner_pre_action({}, { locale })
            : m.planner_post_action({}, { locale })}<span>{group.operations.length}</span>
        </h4>{/if}
      {#each group.operations as operation, index (operation.id)}
        <EffectCard
          {locale}
          {operation}
          participants={participantsBefore(operation)}
          {catalog}
          {avatar}
          system={anchor.kind !== 'action'}
          selected={editingId === operation.id}
          first={index === 0}
          last={index === group.operations.length - 1}
          onEdit={() => onEdit(operation)}
          onMove={(delta) => onChange(moveOperation(operations, operation.id, delta, anchor))}
          onDelete={() => onDelete(operation.id)}
        />
      {/each}
    </section>
  {/each}
</div>

<style>
  .operations,
  .effect-group {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }
  .operations {
    gap: var(--space-3);
  }
  h3 {
    margin: 0;
    font-size: var(--font-body);
    font-weight: 650;
  }
  h4 {
    margin: 0;
    display: flex;
    gap: var(--space-2);
    font-size: var(--font-helper);
    font-weight: 500;
    color: var(--text-secondary);
  }
  h4 span {
    color: var(--gold-soft);
  }
</style>
