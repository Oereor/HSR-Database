<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import RelicIcon from '$lib/components/relic/RelicIcon.svelte';
  import RelicPieceCard from '$lib/components/relic/RelicPieceCard.svelte';
  import { getRelicSetIconUrl } from '$lib/data/visual-assets';
  import { m } from '$lib/paraglide/messages.js';
  import type { RelicSet } from '$lib/domain/types';

  export let detail: RelicSet;
  export let singular: string;
</script>

<header
  class="detail-profile-hero detail-profile-hero--relic detail-profile-hero--relic-compact"
  data-relic-detail-hero
>
  <div class="detail-profile-hero__identity">
    <RelicIcon
      source={getRelicSetIconUrl(detail.id)}
      alt={m.relic_set_preview_alt({ name: detail.name })}
      fallbackLabel={detail.name}
      presentation="hero"
    />
    <div
      class="detail-profile-hero__gradient detail-profile-hero__gradient--relic"
      aria-hidden="true"
    ></div>
    <div class="hero-identity-copy">
      <p class="kicker">{singular} / ID {detail.id}</p>
      <h1><GameText text={detail.name} /></h1>
      <div class="relic-identity-tags" aria-label={m.relic_identity_aria()}>
        <span>{detail.typeName}</span>
        {#if detail.version}<span>{m.relic_version({ version: detail.version })}</span>{/if}
      </div>
    </div>
  </div>
  <aside
    class="detail-profile-hero__inspection relic-effects-panel"
    aria-labelledby="relic-effects"
  >
    <SectionHeading level={1} id="relic-effects">{m.relic_effects()}</SectionHeading>
    {#if detail.effects.length}
      <div class="relic-effect-list" data-effect-count={detail.effects.length}>
        {#each detail.effects as effect (effect.required)}
          <article class="relic-effect" data-effect-requirement={effect.required}>
            <strong>{m.relic_piece_requirement({ count: effect.required })}</strong>
            <p>
              {#if effect.descriptionTokens?.length}
                <DescriptionText tokens={effect.descriptionTokens} />
              {:else}
                <GameText text={effect.description || m.relic_effect_description_unavailable()} />
              {/if}
            </p>
          </article>
        {/each}
      </div>
    {:else}
      <p class="data-placeholder">{m.relic_effects_unavailable()}</p>
    {/if}
  </aside>
</header>

<section class="detail-section relic-piece-section" data-relic-piece-count={detail.pieces.length}>
  <SectionHeading level={1}>{m.relic_pieces()}</SectionHeading>
  {#if detail.pieces.length}
    <div class="relic-piece-list">
      {#each detail.pieces as piece (piece.id)}
        <RelicPieceCard {piece} />
      {/each}
    </div>
  {:else}
    <p class="data-placeholder">{m.relic_pieces_unavailable()}</p>
  {/if}
</section>

<style>
  .relic-identity-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .relic-identity-tags span {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgb(7 10 18 / 68%);
    color: var(--gold-soft);
    font-size: var(--font-helper);
    line-height: 1.2;
  }

  .relic-identity-tags span {
    padding: 0.42rem 0.68rem;
  }

  .relic-effects-panel {
    display: grid;
    min-height: 100%;
    grid-template-rows: auto minmax(0, 1fr);
    padding: clamp(1.25rem, 2vw, 2rem);
  }

  .relic-effect-list {
    display: grid;
    min-width: 0;
    align-content: center;
  }

  .relic-effect {
    min-width: 0;
    padding: clamp(1rem, 2vw, 1.5rem) 0;
  }

  .relic-effect + .relic-effect {
    border-top: 1px solid var(--border);
  }

  .relic-effect strong {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    color: var(--gold-soft);
    font-size: var(--font-meta-value);
    font-weight: 650;
  }

  .relic-effect p {
    max-width: 40rem;
    margin: var(--space-3) 0 0;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.85;
    overflow-wrap: anywhere;
  }

  .relic-piece-list {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  @media (max-width: 820px) {
    .relic-effect-list {
      align-content: start;
    }
  }
</style>
