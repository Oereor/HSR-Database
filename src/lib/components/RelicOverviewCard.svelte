<script lang="ts">
  import type { RelicCatalogEntry } from '$lib/domain/types';
  import EntityOverviewCard from './EntityOverviewCard.svelte';
  import GameText from './GameText.svelte';
  import { relicCategoryLabel } from '$lib/i18n/product';

  export let entry: RelicCatalogEntry;
  export let href: string;
  export let imageUrl: string | undefined;
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
  <svelte:fragment slot="overlay">{relicCategoryLabel(entry.category)}</svelte:fragment>
  <svelte:fragment slot="title"><GameText text={entry.name} /></svelte:fragment>
</EntityOverviewCard>
