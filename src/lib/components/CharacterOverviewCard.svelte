<script lang="ts">
  import type { CatalogEntry } from '$lib/domain/types';
  import { getElementColor } from '$lib/domain/elements';
  import EntityOverviewCard from './EntityOverviewCard.svelte';
  import GameText from './GameText.svelte';
  import RarityStars from './RarityStars.svelte';
  import SemanticIconLabel from './SemanticIconLabel.svelte';

  export let entry: CatalogEntry;
  export let href: string;
  export let imageUrl: string | undefined;
  export let density: 'default' | 'compact' = 'default';
</script>

{#key entry.id}
  <EntityOverviewCard {href} {imageUrl} {density} imageAlt="" fallbackLabel={entry.name}>
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
          presentation="path-identity"
        />{/if}
      {#if entry.elementName}<SemanticIconLabel
          kind="element"
          code={entry.element}
          label={entry.elementName}
          color={getElementColor(entry.element)}
          size="large"
          presentation="character-element-identity"
        />{/if}
    </svelte:fragment>
  </EntityOverviewCard>
{/key}
