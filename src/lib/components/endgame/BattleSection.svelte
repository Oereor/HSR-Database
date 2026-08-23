<script lang="ts">
  import type { EndgameBattleSlotView } from '$lib/domain/endgame-view';
  import type { EndgameEnemyCardVariant } from './presentation';
  import WaveList from './WaveList.svelte';

  export let battle: EndgameBattleSlotView;
  export let enemyVariant: EndgameEnemyCardVariant = 'standard';
</script>

<section class="endgame-battle" id={`battle-${battle.slot}`} data-battle-slot={battle.slot}>
  <header>
    <h3>战斗 {battle.slot}</h3>
    {#if battle.stages.length === 1}<span>Lv.{battle.stages[0].level}</span>{/if}
  </header>
  <slot />
  {#each battle.stages as stage (stage.key)}
    <div class="endgame-stage">
      {#if battle.stages.length > 1}
        <div class="endgame-stage__heading">
          <h4>阶段 {stage.index}</h4>
          <span>Lv.{stage.level}</span>
        </div>
      {/if}
      <WaveList waves={stage.waves} level={stage.level} {enemyVariant} />
    </div>
  {/each}
</section>
