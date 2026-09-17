<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import CharacterCatalogPage from '$lib/components/character/CharacterCatalogPage.svelte';
  import EnemyCatalogPage from '$lib/components/enemy/EnemyCatalogPage.svelte';
  import LightConeCatalogPage from '$lib/components/light-cone/LightConeCatalogPage.svelte';
  import RelicCatalogPage from '$lib/components/relic/RelicCatalogPage.svelte';
  export let data;
</script>

{#if data.category === 'characters'}
  <CharacterCatalogPage
    entries={data.entries}
    title={m.characters_title()}
    description={m.characters_description()}
  />
{:else if data.category === 'light-cones'}
  <LightConeCatalogPage
    entries={data.entries}
    title={m.light_cones_title()}
    description={m.light_cones_description()}
  />
{:else if data.category === 'enemies'}
  <EnemyCatalogPage
    entries={data.entries}
    title={m.navigation_enemies()}
    description={m.enemies_description()}
    enemyPortraits={data.enemyPortraits}
  />
{:else}
  <RelicCatalogPage
    entries={data.entries}
    title={m.relics_title()}
    description={m.relics_description()}
  />
{/if}
