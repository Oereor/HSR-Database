<script lang="ts">
  import EndgameWaveGroup from './EndgameWaveGroup.svelte';
  import {
    buildEndgameWaveRows,
    type EndgameEnemyCardVariant,
    type EndgameWaveGroupPresentation,
    type EndgameWaveLayoutPolicy
  } from './presentation';

  export let groups: EndgameWaveGroupPresentation[];
  export let policy: EndgameWaveLayoutPolicy;
  export let enemyVariant: EndgameEnemyCardVariant = 'standard';

  $: rows = buildEndgameWaveRows(groups, policy);
</script>

<div class="endgame-wave-layout" data-wave-layout={policy}>
  {#each rows as row (row.key)}
    <div class="endgame-wave-row" data-endgame-wave-row>
      {#each row.groups as group, index (group.key)}
        <EndgameWaveGroup
          wave={group.wave}
          ordinal={group.ordinal}
          level={group.level}
          {enemyVariant}
          fullRow={policy === 'stacked'}
          separated={policy === 'paired' && row.groups.length === 2 && index === 1}
        />
      {/each}
    </div>
  {/each}
</div>

<style>
  .endgame-wave-layout {
    display: grid;
    min-width: 0;
    gap: var(--space-8);
  }

  .endgame-wave-row {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-8);
  }

  @container endgame-main (max-width: 520px) {
    .endgame-wave-layout {
      gap: var(--space-6);
    }
  }
</style>
