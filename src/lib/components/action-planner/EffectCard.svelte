<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import type { EffectOperation, UnitConfig } from '$lib/action-planner/types';
  import { effectPhase, targetIds } from '$lib/action-planner/effect-config';
  export let locale: Locale;
  export let operation: EffectOperation;
  export let units: UnitConfig[];
  export let avatar: (id: string) => string | undefined;
  export let system = false;
  export let selected = false;
  export let first = false;
  export let last = false;
  export let onEdit: () => void;
  export let onMove: (delta: -1 | 1) => void;
  export let onDelete: () => void;
  $: ids = targetIds(operation.target, units);
  $: title =
    operation.type === 'advance'
      ? m.planner_advance({}, { locale })
      : operation.type === 'delay'
        ? m.planner_delay({}, { locale })
        : operation.type === 'immediatelyAct'
          ? m.planner_card_immediate({}, { locale })
          : operation.amount >= 0
            ? m.planner_speed_up({}, { locale })
            : m.planner_speed_down({}, { locale });
  function format(value: number) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  }
  $: parameter =
    operation.type === 'advance' || operation.type === 'delay'
      ? m.planner_gauge_summary({ percent: format(operation.percent) }, { locale })
      : operation.type === 'immediatelyAct'
        ? m.planner_card_immediate({}, { locale })
        : `${operation.mode === 'percent' ? m.planner_base_percent({}, { locale }) : m.planner_flat({}, { locale })} ${operation.amount >= 0 ? '+' : ''}${format(operation.amount)}${operation.mode === 'percent' ? '%' : ''} · ${operation.turns === null ? m.planner_infinite({}, { locale }) : m.planner_duration_summary({ turns: operation.turns }, { locale })}`;
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
            title={units.find((unit) => unit.id === id)?.name ??
              m.planner_missing_target({}, { locale })}
          >
            <AssetImage
              src={avatar(id)}
              alt={units.find((unit) => unit.id === id)?.name ??
                m.planner_missing_target({}, { locale })}
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
