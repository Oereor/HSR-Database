<script lang="ts">
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import EndgameEnemyCard from './EndgameEnemyCard.svelte';
  import type { EndgameEnemyCardVariant } from './presentation';

  export let enemies: EnemyOccurrenceView[];
  export let variant: EndgameEnemyCardVariant = 'standard';
</script>

<div class="endgame-enemy-grid" data-enemy-grid>
  {#each enemies as enemy (enemy.identity)}
    <EndgameEnemyCard occurrence={enemy} {variant} />
  {/each}
</div>
