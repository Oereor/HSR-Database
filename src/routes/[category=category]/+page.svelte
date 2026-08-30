<script lang="ts">
  import CatalogPage from '$lib/components/CatalogPage.svelte';
  import CharacterCatalogPage from '$lib/components/CharacterCatalogPage.svelte';
  export let data;
</script>

{#if data.category === 'characters'}
  <CharacterCatalogPage
    entries={data.entries}
    title={data.config.label}
    description="浏览、搜索并筛选角色资料。"
  />
{:else}
  <CatalogPage
    entries={data.entries}
    category={data.category}
    title={data.config.label}
    description={`浏览、搜索和筛选${data.config.label}的真实游戏配置数据。`}
    enemyPortraits={data.enemyPortraits}
  />
{/if}
