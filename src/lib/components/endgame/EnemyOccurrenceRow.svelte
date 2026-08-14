<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import HpDisplay from './HpDisplay.svelte';

  export let occurrence: EnemyOccurrenceView;
  export let emphasis: 'normal' | 'boss' = 'normal';
</script>

<article
  class:endgame-enemy--boss={emphasis === 'boss'}
  class="endgame-enemy"
  data-monster-id={occurrence.monsterId}
  data-template-id={occurrence.monsterTemplateId}
>
  <div class="endgame-enemy__placeholder" aria-hidden="true">敌</div>
  <div class="endgame-enemy__body">
    <div class="endgame-enemy__heading">
      <h4>
        {#if occurrence.enemyHref}
          <a href={occurrence.enemyHref}><GameText text={occurrence.name} /></a>
        {:else}
          <GameText text={occurrence.name} />
        {/if}
        {#if occurrence.count}<span class="endgame-enemy__count">×{occurrence.count}</span>{/if}
      </h4>
      <HpDisplay hp={occurrence.hp} />
    </div>
    {#if occurrence.weaknesses.length}
      <div class="endgame-weaknesses" aria-label="弱点">
        <span class="endgame-weaknesses__label">弱点</span>
        {#each occurrence.weaknesses as weakness}
          <SemanticIconLabel
            kind="element"
            code={weakness.element}
            label={weakness.name}
            color={getElementColor(weakness.element)}
          />
        {/each}
      </div>
    {:else}
      <p class="endgame-enemy__missing">弱点资料暂无</p>
    {/if}
  </div>
</article>
