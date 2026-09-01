<script lang="ts">
  import type { EndgameBattleSlotView } from '$lib/domain/endgame-view';
  import EndgameNodeHeading from './EndgameNodeHeading.svelte';
  import EndgameWaveLayout from './EndgameWaveLayout.svelte';
  import {
    buildEndgameWaveGroups,
    type EndgameEnemyCardVariant,
    type EndgameWaveLayoutPolicy
  } from './presentation';

  export let battle: EndgameBattleSlotView;
  export let waveLayout: EndgameWaveLayoutPolicy;
  export let enemyVariant: EndgameEnemyCardVariant = 'standard';

  $: groups = buildEndgameWaveGroups(battle);
</script>

<section class="endgame-node-section" id={`battle-${battle.slot}`} data-battle-slot={battle.slot}>
  <EndgameNodeHeading slot={battle.slot} />
  <EndgameWaveLayout {groups} policy={waveLayout} {enemyVariant} />
</section>

<style>
  .endgame-node-section {
    min-width: 0;
    scroll-margin-top: 80px;
  }
</style>
