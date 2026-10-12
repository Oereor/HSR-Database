<script lang="ts">
  import type { ParticipantLabels } from '$lib/action-planner/presentation';
  import ParticipantIcon from './ParticipantIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import type { EffectOperation, ParticipantInfo } from '$lib/action-planner/types';
  import { effectPhase, targetIds } from '$lib/action-planner/effect-config';
  import { countdownParticipantId, spawnedParticipantId } from '$lib/action-planner/engine';
  export let labels: ParticipantLabels = new Map();
  export let locale: Locale;
  export let operation: EffectOperation;
  export let participants: ParticipantInfo[];
  export let catalog: ParticipantInfo[] = participants;
  export let avatar: (id: string) => string | undefined;
  export let system = false;
  export let selected = false;
  export let first = false;
  export let last = false;
  export let onEdit: () => void;
  export let onMove: (delta: -1 | 1) => void;
  export let onDelete: () => void;
  $: ids =
    operation.type === 'spawnParticipant'
      ? [spawnedParticipantId(operation.id)]
      : targetIds(operation.target, participants);
  function format(value: number) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  }
  function operationTitle(op: EffectOperation) {
    switch (op.type) {
      case 'spawnParticipant':
        return op.participant.kind === 'actor'
          ? m.planner_create_actor({}, { locale })
          : m.planner_create_event({}, { locale });
      case 'advance':
        return m.planner_advance({}, { locale });
      case 'delay':
        return m.planner_delay({}, { locale });
      case 'immediatelyAct':
        return m.planner_card_immediate({}, { locale });
      case 'addSpeedModifier':
        return op.amount >= 0
          ? m.planner_speed_up({}, { locale })
          : m.planner_speed_down({}, { locale });
    }
  }
  function operationParameter(op: EffectOperation, names: ParticipantLabels) {
    if (op.type === 'spawnParticipant')
      return `${names.get(spawnedParticipantId(op.id)) ?? op.participant.name} · ${format(op.participant.kind === 'actor' ? op.participant.panelSpeed : op.participant.speed)} SPD · ${op.participant.kind === 'scheduledEvent' ? m.planner_once({}, { locale }) : op.participant.actionLimit == null ? m.planner_unlimited_actions({}, { locale }) : m.planner_action_limit_summary({ count: op.participant.actionLimit }, { locale })}`;
    if (op.type === 'advance' || op.type === 'delay')
      return m.planner_gauge_summary({ percent: format(op.percent) }, { locale });
    if (op.type === 'immediatelyAct') return m.planner_card_immediate({}, { locale });
    const duration =
      op.duration.kind === 'countdown'
        ? `${m.planner_until_named_countdown({ name: names.get(countdownParticipantId(op.id)) ?? op.duration.name }, { locale })} · ${format(op.duration.speed)} SPD`
        : op.duration.turns === null
          ? m.planner_infinite({}, { locale })
          : m.planner_duration_summary({ turns: op.duration.turns }, { locale });
    return `${op.mode === 'percent' ? m.planner_base_percent({}, { locale }) : m.planner_flat({}, { locale })} ${op.amount >= 0 ? '+' : ''}${format(op.amount)}${op.mode === 'percent' ? '%' : ''} · ${duration}`;
  }
  $: title = operationTitle(operation);
  $: parameter = operationParameter(operation, labels);
</script>

<div
  class="effect-card"
  class:selected
  data-operation-id={operation.id}
  data-phase={system ? undefined : effectPhase(operation)}
>
  <button
    class="card-main"
    type="button"
    data-testid="edit-effect"
    aria-pressed={selected}
    on:click={onEdit}
  >
    <span class="heading"
      ><strong>{title}</strong>{#if !system}<span class="phase"
          >{effectPhase(operation) === 'preAction'
            ? m.planner_pre_action({}, { locale })
            : m.planner_post_action({}, { locale })}</span
        >{/if}</span
    >
    <span class="detail"
      ><span class="targets">
        {#each ids as id (id)}
          <span
            class="avatar"
            role="img"
            aria-label={labels.get(id) ??
              catalog.find((unit) => unit.id === id)?.name ??
              m.planner_missing_target({}, { locale })}
            title={labels.get(id) ??
              catalog.find((unit) => unit.id === id)?.name ??
              m.planner_missing_target({}, { locale })}
          >
            <ParticipantIcon
              src={catalog.find((participant) => participant.id === id)?.iconUrl ?? avatar(id)}
              event={catalog.find((participant) => participant.id === id)?.kind ===
                'scheduledEvent'}
            />
          </span>
        {/each}
      </span><span class="parameter">{parameter}</span></span
    >
  </button>
  <div class="controls">
    <button
      type="button"
      data-testid="move-effect-up"
      disabled={first}
      aria-label={m.planner_up({}, { locale })}
      on:click={() => onMove(-1)}>↑</button
    >
    <button
      type="button"
      data-testid="move-effect-down"
      disabled={last}
      aria-label={m.planner_down({}, { locale })}
      on:click={() => onMove(1)}>↓</button
    >
    <button
      type="button"
      data-testid="delete-effect"
      aria-label={m.planner_remove({}, { locale })}
      on:click={onDelete}>×</button
    >
  </div>
</div>

<style>
  .effect-card {
    display: flex;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
    overflow: hidden;
  }
  .effect-card.selected {
    border-color: var(--gold);
    box-shadow: inset 2px 0 var(--gold);
    background: var(--surface-2);
  }
  button {
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
  }
  .card-main {
    flex: 1;
    min-width: 0;
    min-height: 4.5rem;
    border: 0;
    background: transparent;
    padding: var(--space-2) var(--space-3);
    text-align: left;
    display: grid;
    align-content: center;
    gap: var(--space-2);
  }
  .card-main:hover {
    background: var(--surface-2);
  }
  button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: -2px;
  }
  .heading,
  .detail {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  strong {
    font-size: var(--font-body);
    font-weight: 650;
  }
  .phase {
    color: var(--gold-soft);
    font-size: var(--font-helper);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 0 var(--space-1);
  }
  .detail {
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }
  .parameter {
    overflow-wrap: anywhere;
  }
  .targets {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .avatar {
    width: 1.5rem;
    height: 1.5rem;
    overflow: hidden;
    border-radius: 3px;
    background: var(--surface-3);
    display: grid;
    place-items: center;
  }
  .avatar :global(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .controls {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--space-1);
  }
  .controls button {
    width: 1.75rem;
    height: 1.4rem;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }
  .controls button:hover:not(:disabled) {
    color: var(--gold-soft);
    background: var(--surface-3);
  }
  .controls button:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
