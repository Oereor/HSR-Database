<script lang="ts">
  import type { EndgameEnemyGridItem, EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import EndgameEnemyCard from './EndgameEnemyCard.svelte';
  import EndgameSummonDialog from './EndgameSummonDialog.svelte';
  import { endgameEnemyGridClass, type EndgameEnemyCardVariant } from './presentation';

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

<div class={endgameEnemyGridClass} data-enemy-grid>
  {#each renderedItems as item (item.key)}
    {#if item.occurrence.summonTargets?.length}
      <EndgameEnemyCard occurrence={item.occurrence} {variant} level={item.level}>
        <EndgameSummonDialog
          slot="actions"
          name={item.occurrence.name}
          targets={item.occurrence.summonTargets}
          {variant}
        />
      </EndgameEnemyCard>
    {:else}
      <EndgameEnemyCard occurrence={item.occurrence} {variant} level={item.level} />
    {/if}
  {/each}
</div>
