<script lang="ts">
  import RogueBlessingCard from '$lib/components/rogue/RogueBlessingCard.svelte';
  import RogueCollectionHeader from '$lib/components/rogue/RogueCollectionHeader.svelte';
  import RoguePathFilter from '$lib/components/rogue/RoguePathFilter.svelte';
  import type { RogueDuPageView } from '$lib/domain/rogue';

  export let data: { rogue: RogueDuPageView };

  let selectedPath: number | undefined;
  $: blessings =
    selectedPath === undefined
      ? data.rogue.blessings
      : data.rogue.blessings.filter((item) => item.path.rawType === selectedPath);
</script>

<svelte:head>
  <title>差分宇宙祝福｜Rogue｜星轨档案库</title>
  <meta name="description" content="查看差分宇宙·乐园漫记的祝福图鉴，并按命途筛选。" />
</svelte:head>

<section aria-label="差分宇宙祝福">
  <RogueCollectionHeader
    kicker="BLESSINGS"
    title="祝福"
    visible={blessings.length}
    total={data.rogue.blessings.length}
  />
  <div class="rogue-collection-filter">
    <span>命途筛选</span>
    <RoguePathFilter
      paths={data.rogue.paths}
      bind:value={selectedPath}
      label="差分宇宙祝福命途筛选"
    />
  </div>
  <div class="rogue-card-list" data-du-blessings>
    {#each blessings as blessing (blessing.id)}
      <RogueBlessingCard {blessing} />
    {/each}
  </div>
</section>
