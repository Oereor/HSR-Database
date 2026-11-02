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

<div
  class="endgame-wave-layout grid min-w-0 gap-6 @min-[521px]/endgame-main:gap-8"
  data-wave-layout={policy}
>
  {#each rows as row (row.key)}
    <div class="endgame-wave-row flex min-w-0 flex-wrap items-start gap-8" data-endgame-wave-row>
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
