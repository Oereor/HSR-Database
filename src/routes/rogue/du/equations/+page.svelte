<script lang="ts">
  import RogueCollectionHeader from '$lib/components/rogue/RogueCollectionHeader.svelte';
  import RogueEquationCard from '$lib/components/rogue/RogueEquationCard.svelte';
  import RoguePathFilter from '$lib/components/rogue/RoguePathFilter.svelte';
  import type { RogueDuPageView } from '$lib/domain/rogue';

  export let data: { rogue: RogueDuPageView };

  let selectedPath: number | undefined;
  $: equations =
    selectedPath === undefined
      ? data.rogue.equations
      : data.rogue.equations.filter((item) => item.main.path.rawType === selectedPath);
</script>

<svelte:head>
  <title>差分宇宙方程｜Rogue｜星轨档案库</title>
  <meta name="description" content="查看差分宇宙·乐园漫记的普通方程与临界方程，并按主命途筛选。" />
</svelte:head>

<section aria-label="差分宇宙方程">
  <RogueCollectionHeader
    kicker="EQUATIONS"
    title="方程"
    description="方程按主命途筛选。"
    visible={equations.length}
    total={data.rogue.equations.length}
  />
  <div class="rogue-collection-filter">
    <span>命途筛选</span>
    <RoguePathFilter
      paths={data.rogue.paths}
      bind:value={selectedPath}
      label="差分宇宙方程主命途筛选"
    />
  </div>
  <div class="rogue-card-list" data-du-equations>
    {#each equations as equation (equation.id)}
      <RogueEquationCard {equation} />
    {/each}
  </div>
</section>
