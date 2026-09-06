<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import OverviewHero from '$lib/components/OverviewHero.svelte';
  import EndgameOverviewCard from '$lib/components/endgame/EndgameOverviewCard.svelte';
  import EndgameOverviewHeroArtwork from '$lib/components/endgame/EndgameOverviewHeroArtwork.svelte';
  import type { EndgameModeView } from '$lib/domain/endgame-view';
  import { formatDocumentTitle } from '$lib/site';

  export let data;

  const regularModes = data.modes.filter((mode: EndgameModeView) => mode.mode !== 'aa');
  const arbitration = data.modes.find((mode: EndgameModeView) => mode.mode === 'aa');
</script>

<svelte:head>
  <title>{formatDocumentTitle('高难模式')}</title>
  <meta name="description" content={m.endgame_hero_description({}, { locale: 'zh-CN' })} />
</svelte:head>

<OverviewHero
  eyebrow={m.endgame_eyebrow({}, { locale: 'zh-CN' })}
  title={m.endgame_hero_title({}, { locale: 'zh-CN' })}
  description={m.endgame_hero_description({}, { locale: 'zh-CN' })}
  countLabel={m.endgame_hero_count({}, { locale: 'zh-CN' })}
>
  <svelte:fragment slot="artwork"><EndgameOverviewHeroArtwork /></svelte:fragment>
</OverviewHero>

<div class="endgame-overview-sections">
  <div class="endgame-overview-grid">
    {#each regularModes as mode (mode.mode)}
      <EndgameOverviewCard {mode} />
    {/each}
  </div>

  {#if arbitration}
    <div class="endgame-overview-arbitration">
      <EndgameOverviewCard mode={arbitration} featured />
    </div>
  {/if}
</div>

<style>
  .endgame-overview-sections {
    display: grid;
    gap: var(--space-6);
  }

  .endgame-overview-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }

  @media (max-width: 959px) {
    .endgame-overview-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
