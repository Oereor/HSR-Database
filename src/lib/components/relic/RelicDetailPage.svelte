<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
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
  class="detail-profile-hero detail-profile-hero--relic detail-profile-hero--relic-compact grid min-w-0 items-start gap-4 min-[1280px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:gap-6"
  data-relic-detail-hero
>
  <div
    class="detail-profile-hero__identity bg-card relative isolate min-w-0 overflow-hidden rounded-xl"
  >
    <RelicIcon
      source={getRelicSetIconUrl(detail.id)}
      alt={m.relic_set_preview_alt({ name: detail.name })}
      presentation="hero"
    />
    <div
      class="detail-profile-hero__gradient detail-profile-hero__gradient--relic"
      aria-hidden="true"
    ></div>
    <div class="hero-identity-copy">
      <p class="kicker">{singular} / ID {detail.id}</p>
      <h1><GameText text={detail.name} /></h1>
      <div
        class="relic-identity-tags text-primary mt-1 flex flex-wrap gap-2 text-sm"
        aria-label={m.relic_identity_aria()}
      >
        <span>{detail.typeName}</span>
        {#if detail.version}<span>{m.relic_version({ version: detail.version })}</span>{/if}
      </div>
    </div>
  </div>
  <Card.Root
    role="complementary"
    class="detail-profile-hero__inspection relic-effects-panel gap-0 p-4 sm:p-5"
    aria-labelledby="relic-effects"
  >
    <SectionHeading level={1} id="relic-effects">{m.relic_effects()}</SectionHeading>
    {#if detail.effects.length}
      <div class="relic-effect-list grid min-w-0 gap-4" data-effect-count={detail.effects.length}>
        {#each detail.effects as effect, index (effect.required)}
          {#if index > 0}<Separator />{/if}
          <article class="relic-effect min-w-0" data-effect-requirement={effect.required}>
            <strong class="text-primary text-sm font-semibold"
              >{m.relic_piece_requirement({ count: effect.required })}</strong
            >
            <p class="text-secondary-foreground mt-2 mb-0 text-base leading-relaxed wrap-anywhere">
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
  </Card.Root>
</header>

<section class="detail-section relic-piece-section" data-relic-piece-count={detail.pieces.length}>
  <SectionHeading level={1}>{m.relic_pieces()}</SectionHeading>
  {#if detail.pieces.length}
    <div class="relic-piece-list grid min-w-0 grid-cols-1 gap-4">
      {#each detail.pieces as piece (piece.id)}
        <RelicPieceCard {piece} />
      {/each}
    </div>
  {:else}
    <p class="data-placeholder">{m.relic_pieces_unavailable()}</p>
  {/if}
</section>
