<script lang="ts">
  import RelicIcon from '$lib/components/relic/RelicIcon.svelte';
  import { getRelicPieceIconUrl } from '$lib/data/visual-assets';
  import { getRarityColor } from '$lib/domain/rarity';
  import { relicSlotLabel } from '$lib/i18n/product';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerRelicSlotView } from '$lib/player/equipment';
  import type { PlayerRelicPieceScore } from '$lib/player/relic-score-contract';
  import { formatRelicScore } from '$lib/player/relic-score-presentation';
  import PlayerAffixRow from './PlayerAffixRow.svelte';

  export let view: PlayerRelicSlotView;
  export let score: PlayerRelicPieceScore | undefined = undefined;
  export let showScore = false;

  $: fallbackLabel = view.relic
    ? m.player_equipment_unknown_relic({ setId: view.relic.setId, type: view.type })
    : m.player_equipment_unequipped();
  $: href = view.set ? localizedHref(`/relics/${view.set.id}`) : undefined;
  $: elementProps = href ? { href } : {};
</script>

<svelte:element
  this={href ? 'a' : 'article'}
  {...elementProps}
  class:player-relic-card--empty={!view.relic}
  class:player-relic-card--link={!!href}
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
        presentation="header"
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
    {#if view.relic}
      <div class="player-relic-card__meta">
        <strong
          class="player-relic-card__level"
          style:color={getRarityColor(view.relic.rarity) ?? 'var(--gold)'}
          >+{view.relic.level}</strong
        >
        {#if showScore}
          <span
            class="player-relic-card__score"
            data-player-relic-piece-score
            aria-label={m.player_relic_score_piece_value({
              value:
                score?.status === 'available'
                  ? formatRelicScore(score.score)
                  : m.player_relic_score_unavailable()
            })}
            >{m.player_relic_score_piece()}
            <strong>{score?.status === 'available' ? formatRelicScore(score.score) : '—'}</strong
            ></span
          >
        {/if}
      </div>
    {/if}
  </header>

  {#if view.relic}
    <div class="player-relic-card__affixes player-relic-card__affixes--main">
      {#if view.mainAffix}
        <PlayerAffixRow affix={view.mainAffix} presentation="main" />
      {:else}
        <p class="player-relic-card__unknown-main">— {m.player_equipment_main_affix_unknown()}</p>
      {/if}
    </div>
    <div class="player-relic-card__affixes player-relic-card__affixes--sub">
      {#if view.subAffixes.length}
        <div class="player-relic-card__affix-list">
          {#each view.subAffixes as affix, index (`${affix.type}:${index}`)}
            <PlayerAffixRow {affix} />
          {/each}
        </div>
      {:else}
        <p class="player-relic-card__unknown-main">—</p>
      {/if}
    </div>
  {/if}
</svelte:element>

<style>
  .player-relic-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: linear-gradient(145deg, rgb(21 28 44 / 88%), rgb(11 16 28 / 88%));
    color: inherit;
    text-decoration: none;
    transition:
      border-color var(--motion),
      background var(--motion),
      transform var(--motion);
  }

  .player-relic-card--link:hover {
    border-color: var(--border-strong);
    background: linear-gradient(145deg, rgb(25 34 53 / 92%), rgb(13 19 32 / 92%));
    transform: translateY(-1px);
  }

  .player-relic-card--link:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
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

  .player-relic-card__meta {
    display: grid;
    min-width: 0;
    justify-items: end;
    align-self: start;
    gap: 0.2rem;
  }

  .player-relic-card__level {
    align-self: start;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }

  .player-relic-card__score {
    color: var(--text-secondary);
    font-size: var(--font-helper);
    line-height: 1.3;
    white-space: nowrap;
  }

  .player-relic-card__score strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  .player-relic-card__affixes {
    border-top: 1px solid var(--border);
    padding: 0.58rem 0.65rem;
  }

  .player-relic-card__affixes--main {
    padding-block: 0.68rem;
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
