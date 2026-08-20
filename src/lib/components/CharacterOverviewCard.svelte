<script lang="ts">
  import type { CatalogEntry } from '$lib/domain/types';
  import { getElementColor } from '$lib/domain/elements';
  import { getCharacterPreviewUrl } from '$lib/data/visual-assets';
  import EntityOverviewCard from './EntityOverviewCard.svelte';
  import GameText from './GameText.svelte';
  import RarityStars from './RarityStars.svelte';
  import SemanticIconLabel from './SemanticIconLabel.svelte';

  export let entry: CatalogEntry;
  export let href: string;

  $: previewUrl = getCharacterPreviewUrl(entry.id);
</script>

<EntityOverviewCard {href} imageUrl={previewUrl} imageAlt="" fallbackLabel={entry.name}>
  <svelte:fragment slot="overlay">
    {#if entry.rarity}<RarityStars rarity={entry.rarity} />{/if}
  </svelte:fragment>
  <svelte:fragment slot="title"><GameText text={entry.name} /></svelte:fragment>
  <svelte:fragment slot="metadata">
    {#if entry.pathName}<SemanticIconLabel
        kind="path"
        code={entry.path}
        label={entry.pathName}
        size="large"
      />{/if}
    {#if entry.elementName}<SemanticIconLabel
        kind="element"
        code={entry.element}
        label={entry.elementName}
        color={getElementColor(entry.element)}
        size="large"
      />{/if}
  </svelte:fragment>
</EntityOverviewCard>
