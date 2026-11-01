<script lang="ts">
  import type { EndgameEnemyGridItem, EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import EndgameEnemyCard from './EndgameEnemyCard.svelte';
  import type { EndgameEnemyCardVariant } from './presentation';

  export let enemies: EnemyOccurrenceView[] = [];
  export let items: EndgameEnemyGridItem[] | undefined = undefined;
  export let variant: EndgameEnemyCardVariant = 'standard';
  export let level: number | undefined = undefined;

  $: renderedItems =
    items ??
    enemies.map((occurrence, index) => ({
      key: `${occurrence.identity}:${index}`,
      occurrence,
      level
    }));
</script>

<div
  class="endgame-enemy-grid grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(200px,100%),260px))] items-stretch justify-start gap-3"
  data-enemy-grid
>
  {#each renderedItems as item (item.key)}
    <EndgameEnemyCard occurrence={item.occurrence} {variant} level={item.level} />
  {/each}
</div>
