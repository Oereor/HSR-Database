<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import CharacterCatalogPage from '$lib/components/CharacterCatalogPage.svelte';
  import EnemyCatalogPage from '$lib/components/EnemyCatalogPage.svelte';
  import LightConeCatalogPage from '$lib/components/LightConeCatalogPage.svelte';
  import RelicCatalogPage from '$lib/components/RelicCatalogPage.svelte';
  export let data;
</script>

{#if data.category === 'characters'}
  <CharacterCatalogPage
    entries={data.entries}
    title={m.characters_title({}, { locale: 'zh-CN' })}
    description={m.characters_description({}, { locale: 'zh-CN' })}
  />
{:else if data.category === 'light-cones'}
  <LightConeCatalogPage
    entries={data.entries}
    title={m.light_cones_title({}, { locale: 'zh-CN' })}
    description={m.light_cones_description({}, { locale: 'zh-CN' })}
  />
{:else if data.category === 'enemies'}
  <EnemyCatalogPage
    entries={data.entries}
    title={m.navigation_enemies({}, { locale: 'zh-CN' })}
    description={m.enemies_description({}, { locale: 'zh-CN' })}
    enemyPortraits={data.enemyPortraits}
  />
{:else}
  <RelicCatalogPage
    entries={data.entries}
    title={m.relics_title({}, { locale: 'zh-CN' })}
    description={m.relics_description({}, { locale: 'zh-CN' })}
  />
{/if}
