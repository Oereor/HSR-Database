<script lang="ts">
  import CharacterCatalogPage from '$lib/components/CharacterCatalogPage.svelte';
  import EnemyCatalogPage from '$lib/components/EnemyCatalogPage.svelte';
  import LightConeCatalogPage from '$lib/components/LightConeCatalogPage.svelte';
  import RelicCatalogPage from '$lib/components/RelicCatalogPage.svelte';
  export let data;
</script>

{#if data.category === 'characters'}
  <CharacterCatalogPage
    entries={data.entries}
    title={data.config.label}
    description="浏览、搜索并筛选角色资料。"
  />
{:else if data.category === 'light-cones'}
  <LightConeCatalogPage
    entries={data.entries}
    title={data.config.label}
    description="浏览、搜索并筛选光锥资料。"
  />
{:else if data.category === 'enemies'}
  <EnemyCatalogPage
    entries={data.entries}
    title="敌方单位"
    description="浏览、搜索并筛选敌方单位资料。"
    enemyPortraits={data.enemyPortraits}
  />
{:else}
  <RelicCatalogPage
    entries={data.entries}
    title={data.config.label}
    description="浏览、搜索并筛选遗器套装资料。"
  />
{/if}
