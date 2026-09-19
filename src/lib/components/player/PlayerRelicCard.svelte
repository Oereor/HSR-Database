<script lang="ts">
  import RelicIcon from '$lib/components/relic/RelicIcon.svelte';
  import { getRelicPieceIconUrl } from '$lib/data/visual-assets';
  import { relicSlotLabel } from '$lib/i18n/product';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerRelicSlotView } from '$lib/player/equipment';
  import PlayerAffixRow from './PlayerAffixRow.svelte';

  export let view: PlayerRelicSlotView;

  $: fallbackLabel = view.relic
    ? m.player_equipment_unknown_relic({ setId: view.relic.setId, type: view.type })
    : m.player_equipment_unequipped();
</script>

<article
  class:player-relic-card--empty={!view.relic}
  class="player-relic-card"
  data-player-relic-slot={view.slot}
  data-player-relic-state={view.relic ? (view.set && view.piece ? 'known' : 'unknown') : 'empty'}
>
  <header>
    <div class="player-relic-card__artwork">
      <RelicIcon
        source={view.piece ? getRelicPieceIconUrl(view.piece.id) : undefined}
        alt={view.piece?.name ?? ''}
        fallbackLabel={view.piece?.name ?? relicSlotLabel(view.slot)}
        presentation="card"
      />
    </div>
    <div class="player-relic-card__identity">
      <span>{relicSlotLabel(view.slot)}</span>
      {#if view.relic}
        <h3>{view.set?.name ?? fallbackLabel}</h3>
        <p>{view.piece?.name ?? fallbackLabel}</p>
      {:else}
        <h3>{m.player_equipment_unequipped()}</h3>
      {/if}
    </div>
    {#if view.relic}<strong class="player-relic-card__level">+{view.relic.level}</strong>{/if}
  </header>

  {#if view.relic}
    <section class="player-relic-card__affixes">
      <h4>{m.player_equipment_main_affix()}</h4>
      {#if view.mainAffix}
        <PlayerAffixRow affix={view.mainAffix} />
      {:else}
        <p class="player-relic-card__unknown-main">— {m.player_equipment_main_affix_unknown()}</p>
      {/if}
    </section>
    <section class="player-relic-card__affixes">
      <h4>{m.player_equipment_sub_affixes()}</h4>
      {#if view.subAffixes.length}
        <div class="player-relic-card__affix-list">
          {#each view.subAffixes as affix, index (`${affix.type}:${index}`)}
            <PlayerAffixRow {affix} />
          {/each}
        </div>
      {:else}
        <p class="player-relic-card__unknown-main">—</p>
      {/if}
    </section>
  {/if}
</article>

<style>
  .player-relic-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: linear-gradient(145deg, rgb(21 28 44 / 88%), rgb(11 16 28 / 88%));
  }

  .player-relic-card > header {
    display: grid;
    min-width: 0;
    grid-template-columns: 4.1rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem;
  }

  .player-relic-card__artwork {
    width: 4.1rem;
    height: 4.1rem;
  }

  .player-relic-card__identity {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }

  .player-relic-card__identity > span,
  .player-relic-card__identity p {
    color: var(--faint);
    font-size: var(--font-internal);
  }

  .player-relic-card__identity h3,
  .player-relic-card__identity p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .player-relic-card__identity h3 {
    color: var(--text-primary);
    font-size: var(--font-meta-value);
    line-height: 1.3;
  }

  .player-relic-card__level {
    align-self: start;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }

  .player-relic-card__affixes {
    border-top: 1px solid var(--border);
    padding: 0.58rem 0.65rem;
  }

  .player-relic-card__affixes h4 {
    margin: 0 0 0.3rem;
    color: var(--faint);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .player-relic-card__affix-list {
    display: grid;
  }

  .player-relic-card__unknown-main {
    margin: 0;
    padding: 0.38rem 0.5rem;
    color: var(--faint);
    font-size: var(--font-internal);
  }

  .player-relic-card--empty {
    min-height: 5.5rem;
    background: rgb(11 16 28 / 58%);
  }
</style>
