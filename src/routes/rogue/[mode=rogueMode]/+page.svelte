<script lang="ts">
  import RogueBaseResonanceCard from '$lib/components/rogue/RogueBaseResonanceCard.svelte';
  import RogueBlessingCard from '$lib/components/rogue/RogueBlessingCard.svelte';
  import RogueCrossResonanceCard from '$lib/components/rogue/RogueCrossResonanceCard.svelte';
  import RogueEnhancementGroupCard from '$lib/components/rogue/RogueEnhancementGroupCard.svelte';
  import RogueModeNav from '$lib/components/rogue/RogueModeNav.svelte';
  import RoguePathFilter from '$lib/components/rogue/RoguePathFilter.svelte';
  import type {
    RogueBaseResonance,
    RogueBlessing,
    RogueCrossResonance,
    RogueResonanceEnhancementGroup,
    RogueSuPageView
  } from '$lib/domain/rogue';

  export let data: { rogue: RogueSuPageView };

  type SuEntry =
    | { kind: 'blessing'; item: RogueBlessing }
    | { kind: 'base'; item: RogueBaseResonance }
    | { kind: 'enhancement'; item: RogueResonanceEnhancementGroup }
    | { kind: 'cross'; item: RogueCrossResonance };

  let selectedPath: number | undefined;

  function entryPath(entry: SuEntry): number {
    return entry.kind === 'cross' ? entry.item.main.path.rawType : entry.item.path.rawType;
  }

  $: entries = [
    ...data.rogue.blessings.map((item): SuEntry => ({ kind: 'blessing', item })),
    ...data.rogue.baseResonances.map((item): SuEntry => ({ kind: 'base', item })),
    ...data.rogue.enhancementGroups.map((item): SuEntry => ({ kind: 'enhancement', item })),
    ...data.rogue.crossResonances.map((item): SuEntry => ({ kind: 'cross', item }))
  ].sort((left, right) => left.item.order - right.item.order);
  $: visibleEntries =
    selectedPath === undefined
      ? entries
      : entries.filter((entry) => entryPath(entry) === selectedPath);
</script>

<svelte:head>
  <title>{data.rogue.label}｜Rogue｜星轨档案库</title>
  <meta
    name="description"
    content={`${data.rogue.label}的祝福、命途回响、回响构音与回响交错图鉴。`}
  />
</svelte:head>

<RogueModeNav activeMode={data.rogue.mode} />

<header class="page-heading rogue-heading">
  <div>
    <p class="kicker">ROGUE ARCHIVE</p>
    <h2>{data.rogue.label}</h2>
    <p>祝福、命途回响、回响构音与回响交错按原始顺序连续展示。</p>
  </div>
  <span class="count-badge">{entries.length} 项</span>
</header>

<p class="rogue-notice" data-su-catalog-notice>
  普通祝福使用三个模拟宇宙模式共享的完整 162
  项图鉴；它不是当前模式的精确掉落池。命途回响与回响交错则按模式归属展示。
</p>

<div class="filter-panel">
  <span>命途筛选</span>
  <RoguePathFilter paths={data.rogue.paths} bind:value={selectedPath} label="模拟宇宙命途筛选" />
</div>

<section class="rogue-card-list" aria-label={`${data.rogue.label}祝福图鉴`} data-su-continuous-flow>
  {#each visibleEntries as entry (`${entry.kind}:${entry.item.id}`)}
    {#if entry.kind === 'blessing'}
      <RogueBlessingCard blessing={entry.item} />
    {:else if entry.kind === 'base'}
      <RogueBaseResonanceCard resonance={entry.item} />
    {:else if entry.kind === 'enhancement'}
      <RogueEnhancementGroupCard group={entry.item} />
    {:else}
      <RogueCrossResonanceCard resonance={entry.item} />
    {/if}
  {/each}
</section>

<style>
  .rogue-heading {
    margin-bottom: var(--space-4);
  }
  .rogue-heading h2 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: var(--font-page-title);
  }
  .rogue-notice {
    border-left: 2px solid rgb(196 162 117 / 52%);
    margin: 0 0 var(--space-5);
    padding: 0.2rem 0 0.2rem 0.85rem;
    color: var(--text-muted);
    font-size: var(--font-helper);
    line-height: 1.65;
  }
  .filter-panel {
    display: grid;
    align-items: start;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .filter-panel > span {
    color: var(--text-muted);
    font-size: var(--font-helper);
    letter-spacing: 0.05em;
  }
  .rogue-card-list {
    display: grid;
    min-width: 0;
    gap: var(--space-4);
  }
  @media (max-width: 520px) {
    .rogue-card-list {
      gap: var(--space-3);
    }
  }
</style>
