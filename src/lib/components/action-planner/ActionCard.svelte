<script lang="ts">
  import type { ParticipantLabels } from '$lib/action-planner/presentation';
  import ParticipantIcon from './ParticipantIcon.svelte';
  import {
    formatAV,
    orderedCardOperations,
    operationTitle,
    type ActionCardData
  } from '$lib/action-planner/presentation';
  import { anchorKey } from '$lib/action-planner/engine';
  import type { EffectOperation } from '$lib/action-planner/types';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';

  export let labels: ParticipantLabels = new Map();
  export let locale: Locale;
  export let card: ActionCardData;
  export let avatar: string | undefined = undefined;
  export let operations: EffectOperation[] = [];
  export let selected = false;
  export let onSelect: () => void;

  $: configured = orderedCardOperations(operations, card.anchor);
  $: changes =
    card.kind === 'system'
      ? []
      : card.actionChanges.filter((change) => change.deltaAV !== 0 || change.zeroAVInsertion);

  function format(value: number) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  }
</script>

<div
  class="action-card"
  class:selected
  class:system={card.kind === 'system'}
  class:scheduled={card.anchor.kind === 'trigger'}
>
  <button
    type="button"
    class="card-main"
    aria-pressed={selected}
    data-testid={card.kind === 'system'
      ? 'start-node'
      : card.kind === 'future'
        ? 'action-node'
        : 'queue-unit'}
    data-anchor={anchorKey(card.anchor)}
    data-unit-id={card.anchor.kind !== 'start' ? card.anchor.participantId : undefined}
    data-turn={card.anchor.kind === 'action' ? card.anchor.turn : undefined}
    data-total-av={card.kind !== 'queue' ? card.elapsedAV : undefined}
    data-delta-av={card.kind === 'future' ? card.deltaAV : undefined}
    data-remaining-av={card.kind === 'queue' ? card.remainingAV : undefined}
    on:click={onSelect}
  >
    {#if card.kind === 'system'}
      <span class="system-icon" aria-hidden="true">✦</span>
    {:else}
      <span class="avatar" aria-hidden="true"
        ><ParticipantIcon
          src={card.iconUrl ?? avatar}
          event={card.anchor.kind === 'trigger'}
        /></span
      >
    {/if}
    <span class="identity">
      <strong
        >{card.anchor.kind === 'start'
          ? card.name
          : (labels.get(card.anchor.participantId) ?? card.name)}</strong
      >
      {#if card.kind !== 'system'}
        <span class="metadata">
          <span
            >{card.anchor.kind === 'action'
              ? m.planner_card_turn({ turn: card.anchor.turn }, { locale })
              : m.planner_scheduled_event({}, { locale })}</span
          >
          <span>{format(card.effectiveSpeed)} SPD</span>
        </span>
      {/if}
    </span>
    <span class="av-value">
      <span class="primary" data-testid="card-primary-av">
        <span class="visually-hidden"
          >{card.kind === 'queue'
            ? m.planner_remaining_av({}, { locale })
            : m.planner_total_av({}, { locale })}
        </span>
        <span data-testid="card-av-number"
          >{formatAV(card.kind === 'queue' ? card.remainingAV : card.elapsedAV, locale)}</span
        >
      </span>
      {#if card.kind === 'future'}
        <span class="secondary" data-testid="card-delta-av"
          >+{formatAV(card.deltaAV, locale)} {m.planner_delta_av({}, { locale })}</span
        >
      {:else if card.kind === 'queue'}
        <span class="secondary" data-testid="card-remaining-label"
          >{m.planner_remaining_av({}, { locale })}</span
        >
      {/if}
    </span>
    {#if changes.length || configured.length}
      <span class="card-explanation">
        {#if changes.length}
          <span class="change-markers" aria-label={m.planner_received_changes({}, { locale })}>
            {#each changes as change, index (`${change.operationId}:${index}`)}
              <span
                class="change-marker"
                class:delay={change.type === 'delay'}
                data-testid="action-change"
                data-operation-id={change.operationId}
                data-kind={change.type}
                data-delta-av={change.deltaAV}
                data-insertion={change.zeroAVInsertion}
                title={change.type === 'advance'
                  ? m.planner_advance({}, { locale })
                  : m.planner_delay({}, { locale })}
              >
                <span aria-hidden="true">{change.type === 'advance' ? '↑' : '↓'}</span>
                <span class="visually-hidden"
                  >{change.type === 'advance'
                    ? m.planner_advance({}, { locale })
                    : m.planner_delay({}, { locale })}</span
                >
                {change.zeroAVInsertion
                  ? m.planner_queue_insertion({}, { locale })
                  : `${formatAV(change.deltaAV, locale, true)} AV`}
              </span>
            {/each}
          </span>
        {/if}
        {#if configured.length}
          <span class="operation-tags" aria-label={m.planner_configured_effects({}, { locale })}>
            {#each configured as operation (operation.id)}
              <span
                class="operation-tag"
                data-testid="operation-tag"
                data-kind={operation.type}
                data-operation-id={operation.id}
                title={operation.phase === 'preAction'
                  ? m.planner_pre_action({}, { locale })
                  : operation.phase === 'postAction'
                    ? m.planner_post_action({}, { locale })
                    : undefined}
              >
                {operationTitle(operation, locale)}
              </span>
            {/each}
          </span>
        {/if}
      </span>
    {/if}
  </button>
  {#if card.kind === 'queue' && card.modifiers.length}
    <details class="speed-states" data-testid="queue-speed-states">
      <summary>{m.planner_card_speed_states({ count: card.modifiers.length }, { locale })}</summary>
      {#each card.modifiers as buff (buff.id)}
        <div class="speed-state">
          <span
            >{buff.amount > 0 ? '+' : ''}{format(buff.amount)}{buff.mode === 'percent'
              ? '%'
              : ' SPD'} · {buff.lifetime.kind === 'countdown'
              ? labels.has(buff.lifetime.participantId)
                ? m.planner_until_named_countdown(
                    { name: labels.get(buff.lifetime.participantId)! },
                    { locale }
                  )
                : m.planner_until_countdown({}, { locale })
              : buff.lifetime.remainingTurns === null
                ? m.planner_infinite({}, { locale })
                : m.planner_remaining_turns(
                    { turns: buff.lifetime.remainingTurns },
                    { locale }
                  )}</span
          >
        </div>
      {/each}
    </details>
  {/if}
</div>

<style>
  .action-card {
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    border-radius: var(--radius-control);
    background: var(--surface);
    overflow: clip;
    container-type: inline-size;
  }
  .action-card.scheduled {
    border-style: dashed;
  }
  .action-card.selected {
    border-color: var(--gold);
    background: var(--surface-2);
    box-shadow: inset 2px 0 var(--gold);
  }
  .card-main {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-width: 0;
    min-height: 4.75rem;
    padding: var(--space-3);
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card-main:hover {
    background: var(--surface-2);
  }
  .card-main:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: -3px;
  }
  .avatar {
    width: 3rem;
    height: 3rem;
    border-radius: var(--radius-control);
    overflow: hidden;
    background: var(--surface-3);
    display: grid;
    place-items: center;
  }
  .avatar :global(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .identity {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .identity strong {
    display: block;
    font-size: var(--font-body);
    font-weight: 650;
    line-height: 1.4;
  }
  .metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
    margin-top: var(--space-1);
  }
  .metadata,
  .secondary,
  .speed-states {
    color: var(--text-secondary);
    font-size: var(--font-helper);
    line-height: 1.5;
  }
  .metadata span {
    white-space: nowrap;
  }
  .card-explanation {
    grid-column: 2 / -1;
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }
  .operation-tags,
  .change-markers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
  }
  .operation-tag {
    padding: 1px var(--space-2);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    color: var(--text-secondary);
    font-size: var(--font-helper);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .change-marker {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-1);
    color: var(--gold-soft);
    font-size: var(--font-helper);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .change-marker.delay {
    color: var(--text-primary);
  }
  .av-value {
    display: grid;
    gap: var(--space-1);
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .primary {
    color: var(--gold-soft);
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .system .card-main {
    grid-template-columns: 1rem minmax(0, 1fr) auto;
    min-height: 3.25rem;
  }
  .system-icon {
    color: var(--gold);
    text-align: center;
  }
  .system .primary {
    font-size: var(--font-body);
  }
  .speed-states {
    margin: 0 var(--space-3) var(--space-3);
  }
  .speed-states summary {
    cursor: pointer;
  }
  .speed-states summary:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .speed-state {
    display: grid;
    gap: var(--space-1);
    margin-top: var(--space-2);
    overflow-wrap: anywhere;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @container (max-width: 20rem) {
    .card-main {
      grid-template-columns: 3rem minmax(0, 1fr);
      gap: var(--space-2) var(--space-3);
    }
    .av-value {
      grid-column: 2;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .primary {
      white-space: nowrap;
    }
    .system .card-main {
      grid-template-columns: 1rem minmax(0, 1fr) auto;
    }
    .system .av-value {
      grid-column: 3;
    }
  }
</style>
