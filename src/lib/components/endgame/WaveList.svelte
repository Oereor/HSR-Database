<script lang="ts">
  import type { EndgameWaveView } from '$lib/domain/endgame-view';
  import EnemyOccurrenceRow from './EnemyOccurrenceRow.svelte';

  export let waves: EndgameWaveView[];
  export let boss = false;
  export let dense = false;
</script>

<div class="endgame-wave-list">
  {#each waves as wave (wave.key)}
    <section class="endgame-wave" data-wave={wave.key}>
      <h4>{wave.label}</h4>
      <div class="endgame-wave__enemies">
        {#each wave.enemies as enemy (enemy.identity)}
          <EnemyOccurrenceRow
            occurrence={enemy}
            emphasis={boss ? 'boss' : dense ? 'dense' : 'normal'}
          />
        {/each}
      </div>
    </section>
  {/each}
</div>
