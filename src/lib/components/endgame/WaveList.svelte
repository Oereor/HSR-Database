<script lang="ts">
  import type { EndgameWaveView } from '$lib/domain/endgame-view';
  import EndgameEnemyGrid from './EndgameEnemyGrid.svelte';
  import type { EndgameEnemyCardVariant } from './presentation';

  export let waves: EndgameWaveView[];
  export let enemyVariant: EndgameEnemyCardVariant = 'standard';

  $: highDensity = waves.length >= 3 && waves.some((wave) => wave.enemies.length >= 3);
  $: sparseThreeWave = waves.length === 3 && !highDensity;
</script>

<div
  class:endgame-wave-list--high-density={highDensity}
  class:endgame-wave-list--sparse-three={sparseThreeWave}
  class="endgame-wave-list"
  data-wave-layout={highDensity ? 'high-density' : 'standard'}
>
  {#each waves as wave (wave.key)}
    <section class="endgame-wave" data-wave={wave.key}>
      <h4>{wave.label}</h4>
      <EndgameEnemyGrid enemies={wave.enemies} variant={enemyVariant} />
    </section>
  {/each}
</div>
