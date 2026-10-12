<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { summarizeEffects, type ActionCardData } from '$lib/action-planner/presentation';
  import { anchorKey } from '$lib/action-planner/engine';
  import type { EffectOperation } from '$lib/action-planner/types';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';

  export let locale: Locale;
  export let card: ActionCardData;
  export let avatar: string | undefined = undefined;
  export let operations: EffectOperation[] = [];
  export let selected = false;
  export let onSelect: () => void;

  $: summary = summarizeEffects(operations);
  $: summaryName =
    summary?.kind === 'advance'
      ? m.planner_advance({}, { locale })
      : summary?.kind === 'delay'
        ? m.planner_delay({}, { locale })
        : summary?.kind === 'immediatelyAct'
          ? m.planner_card_immediate({}, { locale })
          : m.planner_card_speed_changes({}, { locale });

  function format(value: number) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  }
</script>

<div class="action-card" class:selected class:system={card.kind === 'system'}>
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
    data-unit-id={card.anchor.kind === 'action' ? card.anchor.unitId : undefined}
    data-turn={card.anchor.kind === 'action' ? card.anchor.turn : undefined}
    data-total-av={card.kind !== 'queue' ? card.elapsedAV : undefined}
    data-delta-av={card.kind === 'future' ? card.deltaAV : undefined}
    data-remaining-av={card.kind === 'queue' ? card.remainingAV : undefined}
    on:click={onSelect}
  >
    {#if card.kind === 'system'}
      <span class="system-icon" aria-hidden="true">✦</span>
    {:else}
      <span class="avatar" aria-hidden="true"><AssetImage src={avatar} alt="" /></span>
    {/if}
    <span class="identity">
      <strong>{card.name}</strong>
      {#if card.kind !== 'system'}
        <span class="metadata">
          <span>{m.planner_card_turn({ turn: card.anchor.turn }, { locale })}</span>
          <span>{format(card.effectiveSpeed)} SPD</span>
        </span>
      {/if}
      {#if summary}
        <span
          class="effect-summary"
          data-testid="effect-summary"
          data-kind={summary.kind}
          data-count={summary.count}
        >
          {summary.kind === 'mixed'
            ? m.planner_effect_count({ count: summary.count }, { locale })
            : m.planner_card_effect_summary(
                { name: summaryName, count: summary.count },
                { locale }
              )}
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
          >{format(card.kind === 'queue' ? card.remainingAV : card.elapsedAV)}</span
        >
      </span>
      {#if card.kind === 'future'}
        <span class="secondary" data-testid="card-delta-av"
          >+{format(card.deltaAV)} {m.planner_delta_av({}, { locale })}</span
        >
      {:else if card.kind === 'queue'}
        <span class="secondary" data-testid="card-remaining-label"
          >{m.planner_remaining_av({}, { locale })}</span
        >
      {/if}
    </span>
  </button>
  {#if card.kind === 'queue' && card.modifiers.length}
    <details class="speed-states" data-testid="queue-speed-states">
      <summary>{m.planner_card_speed_states({ count: card.modifiers.length }, { locale })}</summary>
      {#each card.modifiers as buff (buff.id)}
        <div class="speed-state">
          <span
            >{buff.amount > 0 ? '+' : ''}{format(buff.amount)}{buff.mode === 'percent'
              ? '%'
              : ' SPD'} · {buff.remainingTurns === null
              ? m.planner_infinite({}, { locale })
              : m.planner_remaining_turns({ turns: buff.remainingTurns }, { locale })}</span
          >
          <small>{buff.id}</small>
        </div>
      {/each}
    </details>
  {/if}
</div>

<style>
  .action-card {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
    overflow: clip;
    container-type: inline-size;
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
  .effect-summary {
    display: block;
    margin-top: var(--space-1);
    color: var(--gold-soft);
    font-size: var(--font-helper);
    line-height: 1.4;
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
