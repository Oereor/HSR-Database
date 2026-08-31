<script lang="ts">
  import type { ApocalypticShadowSlotGuideView, EndgameStageView } from '$lib/domain/endgame-view';
  import EndgameEnemyGrid from '../EndgameEnemyGrid.svelte';
  import AsBossTraits from './AsBossTraits.svelte';

  export let stages: EndgameStageView[];
  export let bossGuide: ApocalypticShadowSlotGuideView | undefined = undefined;

  $: sourceGroupCount = stages.reduce((count, stage) => count + stage.waves.length, 0);
  $: hasTraits = Boolean(bossGuide?.traits.length);
</script>

<div class:as-boss-dossier--with-traits={hasTraits} class="as-boss-dossier" data-as-boss-dossier>
  <section class="as-boss-roster" data-as-boss-roster>
    <h4>首领幻影</h4>
    <div class="as-boss-roster__groups">
      {#each stages as stage (stage.key)}
        {#each stage.waves as wave (wave.key)}
          <div class="as-boss-roster__group" data-as-boss-source-group>
            {#if sourceGroupCount > 1}
              <p>阶段 {stage.index} · {wave.label}</p>
            {/if}
            <EndgameEnemyGrid enemies={wave.enemies} variant="standard" level={stage.level} />
          </div>
        {/each}
      {/each}
    </div>
  </section>

  {#if bossGuide?.traits.length}
    <AsBossTraits traits={bossGuide.traits} />
  {/if}
</div>

<style>
  .as-boss-dossier {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
    align-items: start;
  }

  .as-boss-roster {
    width: min(260px, 100%);
    min-width: 0;
  }

  .as-boss-roster > h4 {
    margin: 0 0 var(--space-4);
    color: var(--text-primary);
    font-size: var(--font-major-title);
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.015em;
  }

  .as-boss-roster__groups {
    display: grid;
    min-width: 0;
    gap: var(--space-5);
  }

  .as-boss-roster__group {
    min-width: 0;
  }

  .as-boss-roster__group > p {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--font-helper);
  }

  .as-boss-roster :global(.endgame-enemy-grid) {
    grid-template-columns: minmax(0, min(260px, 100%));
    justify-content: start;
  }

  @container endgame-main (min-width: 700px) {
    .as-boss-dossier--with-traits {
      grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
    }
  }

  @media (max-width: 520px) {
    .as-boss-dossier {
      gap: var(--space-6);
    }
  }
</style>
