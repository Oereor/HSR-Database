<script lang="ts">
  import type { ApocalypticShadowSlotGuideView, EndgameStageView } from '$lib/domain/endgame-view';
  import EndgameEnemyGrid from '../EndgameEnemyGrid.svelte';
  import AsBossTraits from './AsBossTraits.svelte';
  import { m } from '$lib/paraglide/messages.js';

  export let stages: EndgameStageView[];
  export let bossGuide: ApocalypticShadowSlotGuideView | undefined = undefined;

  $: sourceGroupCount = stages.reduce((count, stage) => count + stage.waves.length, 0);
  $: hasTraits = Boolean(bossGuide?.traits.length);
</script>

<div
  class:as-boss-dossier--with-traits={hasTraits}
  class="as-boss-dossier grid min-w-0 grid-cols-1 items-start gap-6 min-[521px]:gap-8"
  data-as-boss-dossier
>
  <section class="as-boss-roster w-[min(260px,100%)] min-w-0" data-as-boss-roster>
    <h4 class="text-foreground m-0 mb-4 text-lg leading-snug font-semibold">
      {m.endgame_boss_illusion()}
    </h4>
    <div class="as-boss-roster__groups grid min-w-0 gap-5">
      {#each stages as stage (stage.key)}
        {#each stage.waves as wave (wave.key)}
          <div class="as-boss-roster__group min-w-0" data-as-boss-source-group>
            {#if sourceGroupCount > 1}
              <p class="text-muted-foreground m-0 mb-3 text-xs">
                {m.endgame_stage_wave({ stage: stage.index, wave: wave.label })}
              </p>
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
  .as-boss-roster :global(.endgame-enemy-grid) {
    grid-template-columns: minmax(0, min(260px, 100%));
    justify-content: start;
  }
  @container endgame-main (min-width: 700px) {
    .as-boss-dossier--with-traits {
      grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
    }
  }
</style>
