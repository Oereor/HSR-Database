<script lang="ts">
  import CatalogPage from '$lib/components/CatalogPage.svelte';
  export let data;
</script>

<CatalogPage
  entries={data.entries}
  category={data.category}
  title={data.config.label}
  description={`浏览、搜索和筛选${data.config.label}的真实游戏配置数据。`}
  enemyPortraits={data.enemyPortraits}
/>
