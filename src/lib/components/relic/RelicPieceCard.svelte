<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import Disclosure from '$lib/components/shared/Disclosure.svelte';
  import RelicIcon from '$lib/components/relic/RelicIcon.svelte';
  import { getRelicPieceIconUrl } from '$lib/data/visual-assets';
  import { relicSlotLabel } from '$lib/i18n/product';
  import { m } from '$lib/paraglide/messages.js';
  import type { RelicSet } from '$lib/domain/types';

  export let piece: RelicSet['pieces'][number];
</script>

<article class="relic-piece-card" data-relic-piece-id={piece.id} data-relic-slot={piece.slot}>
  <div class="relic-piece-card__primary">
    <RelicIcon
      source={getRelicPieceIconUrl(piece.id)}
      alt={piece.name}
      fallbackLabel={piece.name}
      presentation="piece"
    />
    <div class="relic-piece-card__copy">
      <div class="relic-piece-card__heading">
        <h3><GameText text={piece.name} /></h3>
        <span class="relic-piece-card__slot">
          {relicSlotLabel(piece.slot) || m.relic_piece_type_unavailable()}
        </span>
      </div>
      <p class:muted={!piece.description}>
        <GameText text={piece.description || m.relic_piece_description_unavailable()} />
      </p>
    </div>
  </div>
  {#if piece.lore}
    <Disclosure label={m.relic_view_story()} expandOnWideScreens data-relic-story-section>
      <div data-relic-lore>
        <p><GameText text={piece.lore} /></p>
      </div>
    </Disclosure>
  {/if}
</article>

<style>
  .relic-piece-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: linear-gradient(155deg, rgb(255 255 255 / 4%), transparent 46%), var(--surface);
    padding: var(--space-4);
  }

  .relic-piece-card__primary {
    display: grid;
    min-width: 0;
    grid-template-columns: 96px minmax(0, 1fr);
    align-items: start;
    gap: var(--space-4);
  }

  .relic-piece-card__copy {
    min-width: 0;
  }

  .relic-piece-card__heading {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .relic-piece-card h3 {
    min-width: 0;
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-major-title);
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .relic-piece-card__slot {
    display: inline-flex;
    width: fit-content;
    flex: 0 0 auto;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgb(7 10 18 / 68%);
    padding: 0.3rem 0.58rem;
    color: var(--gold-soft);
    font-size: var(--font-helper);
    line-height: 1.2;
  }

  .relic-piece-card p {
    margin: var(--space-3) 0 0;
    color: var(--text-secondary);
    font-size: var(--font-body);
    line-height: 1.72;
    overflow-wrap: anywhere;
  }

  @media (max-width: 820px) {
    .relic-piece-card__primary {
      grid-template-columns: 64px minmax(0, 1fr);
      gap: var(--space-3);
    }
  }
</style>
