<script lang="ts">
  import OverviewHero from '$lib/components/OverviewHero.svelte';
  import EndgameOverviewCard from '$lib/components/endgame/EndgameOverviewCard.svelte';
  import EndgameOverviewHeroArtwork from '$lib/components/endgame/EndgameOverviewHeroArtwork.svelte';
  import type { EndgameModeView } from '$lib/domain/endgame-view';

  export let data;

  const regularModes = data.modes.filter((mode: EndgameModeView) => mode.mode !== 'aa');
  const arbitration = data.modes.find((mode: EndgameModeView) => mode.mode === 'aa');
</script>

<svelte:head>
  <title>高难模式｜星轨档案库</title>
  <meta name="description" content="浏览混沌回忆、虚构叙事、末日幻影与异相仲裁的历史赛期。" />
</svelte:head>

<OverviewHero
  eyebrow="DATABASE / ENDGAME"
  title="高难模式"
  description="浏览混沌回忆、虚构叙事、末日幻影与异相仲裁的历史赛期。"
  countLabel="共 4 种模式"
>
  <svelte:fragment slot="artwork"><EndgameOverviewHeroArtwork /></svelte:fragment>
</OverviewHero>

<div class="endgame-overview-sections">
  <section class="endgame-overview-section" aria-labelledby="regular-endgame-heading">
    <header class="endgame-overview-section__heading">
      <h2 id="regular-endgame-heading">常规高难</h2>
      <p>混沌回忆、虚构叙事与末日幻影交替更新。</p>
    </header>
    <div class="endgame-overview-grid">
      {#each regularModes as mode (mode.mode)}
        <EndgameOverviewCard {mode} />
      {/each}
    </div>
  </section>

  {#if arbitration}
    <section
      class="endgame-overview-section endgame-overview-section--arbitration"
      aria-labelledby="arbitration-heading"
    >
      <header class="endgame-overview-section__heading">
        <h2 id="arbitration-heading">异相仲裁</h2>
        <p>独立高难模式。</p>
      </header>
      <EndgameOverviewCard mode={arbitration} featured />
    </section>
  {/if}
</div>

<style>
  .endgame-overview-sections {
    display: grid;
    gap: var(--space-12);
  }

  .endgame-overview-section__heading {
    margin-bottom: var(--space-4);
  }

  .endgame-overview-section__heading h2 {
    margin: 0 0 var(--space-1);
    font-size: var(--font-section-title);
  }

  .endgame-overview-section__heading p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }

  .endgame-overview-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }

  .endgame-overview-section--arbitration {
    padding-top: var(--space-2);
  }

  @media (max-width: 959px) {
    .endgame-overview-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .endgame-overview-sections {
      gap: var(--space-16);
    }
  }
</style>
