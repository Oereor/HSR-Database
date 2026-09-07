<script lang="ts">
  import type { CatalogEntry } from '$lib/domain/types';
  import EntityOverviewCard from './EntityOverviewCard.svelte';
  import GameText from './GameText.svelte';
  import RarityStars from './RarityStars.svelte';
  import SemanticIconLabel from './SemanticIconLabel.svelte';

  export let entry: CatalogEntry;
  export let href: string;
  export let imageUrl: string | undefined;
</script>

{#key entry.id}
  <EntityOverviewCard
    {href}
    {imageUrl}
    density="compact"
    imageAlt=""
    fallbackLabel={entry.name}
    metadataLayout="icons"
  >
    <svelte:fragment slot="overlay">
      {#if entry.rarity}<RarityStars rarity={entry.rarity} />{/if}
    </svelte:fragment>
    <svelte:fragment slot="title"><GameText text={entry.name} /></svelte:fragment>
    <svelte:fragment slot="metadata">
      {#if entry.pathName}<SemanticIconLabel
          kind="path"
          code={entry.path}
          label={entry.pathName}
          showLabel={false}
          fallbackMark="?"
          presentation="overview-icon"
        />{/if}
    </svelte:fragment>
  </EntityOverviewCard>
{/key}
