<script lang="ts">
  import type { RelicCatalogEntry, RelicSetCategory } from '$lib/domain/types';
  import EntityOverviewCard from './EntityOverviewCard.svelte';
  import GameText from './GameText.svelte';

  export let entry: RelicCatalogEntry;
  export let href: string;
  export let imageUrl: string | undefined;

  const categoryLabels: Record<RelicSetCategory, string> = {
    cavern: '隧洞遗器',
    planar: '位面饰品'
  };
</script>

<EntityOverviewCard
  {href}
  {imageUrl}
  imageAlt=""
  fallbackLabel={entry.name}
  artworkFit="contain"
  artworkPosition="center"
  size="compact"
  mediaPresentation="icon"
>
  <svelte:fragment slot="overlay">{categoryLabels[entry.category]}</svelte:fragment>
  <svelte:fragment slot="title"><GameText text={entry.name} /></svelte:fragment>
</EntityOverviewCard>
