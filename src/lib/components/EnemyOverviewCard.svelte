<script lang="ts">
  import type { EnemyCatalogEntry } from '$lib/domain/types';
  import { getEnemyRankLabel } from '$lib/domain/enemy-overview';
  import EnemyWeaknessGroup from './EnemyWeaknessGroup.svelte';
  import EntityOverviewCard from './EntityOverviewCard.svelte';
  import GameText from './GameText.svelte';

  export let entry: EnemyCatalogEntry;
  export let href: string;
  export let imageUrl: string | undefined = undefined;
</script>

<EntityOverviewCard {href} {imageUrl} density="compact" imageAlt="" fallbackLabel={entry.name}>
  <svelte:fragment slot="overlay">{getEnemyRankLabel(entry.type)}</svelte:fragment>
  <svelte:fragment slot="title"><GameText text={entry.name} /></svelte:fragment>
  <svelte:fragment slot="metadata">
    <EnemyWeaknessGroup weaknesses={entry.weaknesses} size="overview" />
  </svelte:fragment>
</EntityOverviewCard>
