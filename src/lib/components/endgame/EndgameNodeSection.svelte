<script lang="ts">
  import InlineDividerHeading from '$lib/components/InlineDividerHeading.svelte';
  import type { EndgameBattleSlotView } from '$lib/domain/endgame-view';
  import EndgameWaveLayout from './EndgameWaveLayout.svelte';
  import {
    buildEndgameWaveGroups,
    formatChineseOrdinal,
    type EndgameEnemyCardVariant,
    type EndgameWaveLayoutPolicy
  } from './presentation';

  export let battle: EndgameBattleSlotView;
  export let waveLayout: EndgameWaveLayoutPolicy;
  export let enemyVariant: EndgameEnemyCardVariant = 'standard';

  $: groups = buildEndgameWaveGroups(battle);
</script>

<section class="endgame-node-section" id={`battle-${battle.slot}`} data-battle-slot={battle.slot}>
  <div class="endgame-node-section__heading">
    <InlineDividerHeading level={3} scale="medium">
      节点{formatChineseOrdinal(battle.slot)}
    </InlineDividerHeading>
  </div>
  <EndgameWaveLayout {groups} policy={waveLayout} {enemyVariant} />
</section>

<style>
  .endgame-node-section {
    min-width: 0;
    scroll-margin-top: 80px;
  }

  .endgame-node-section__heading {
    margin-bottom: var(--space-6);
  }
</style>
