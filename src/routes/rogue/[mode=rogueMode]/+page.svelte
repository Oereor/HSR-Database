<script lang="ts">
  import RogueBaseResonanceCard from '$lib/components/rogue/RogueBaseResonanceCard.svelte';
  import RogueBlessingCard from '$lib/components/rogue/RogueBlessingCard.svelte';
  import RogueCrossResonanceCard from '$lib/components/rogue/RogueCrossResonanceCard.svelte';
  import RogueEnhancementGroupCard from '$lib/components/rogue/RogueEnhancementGroupCard.svelte';
  import RogueEquationCard from '$lib/components/rogue/RogueEquationCard.svelte';
  import RogueModeNav from '$lib/components/rogue/RogueModeNav.svelte';
  import RoguePathFilter from '$lib/components/rogue/RoguePathFilter.svelte';
  import type {
    RogueBaseResonance,
    RogueBlessing,
    RogueCrossResonance,
    RogueEquation,
    RoguePageView,
    RogueResonanceEnhancementGroup,
    RogueSuPageView
  } from '$lib/domain/rogue';

  export let data: { rogue: RoguePageView };

  type SuEntry =
    | { kind: 'blessing'; item: RogueBlessing }
    | { kind: 'base'; item: RogueBaseResonance }
    | { kind: 'enhancement'; item: RogueResonanceEnhancementGroup }
    | { kind: 'cross'; item: RogueCrossResonance };

  let suPath: number | undefined;
  let duBlessingPath: number | undefined;
  let duEquationPath: number | undefined;

  function buildSuEntries(view: RogueSuPageView): SuEntry[] {
    return [
      ...view.blessings.map((item): SuEntry => ({ kind: 'blessing', item })),
      ...view.baseResonances.map((item): SuEntry => ({ kind: 'base', item })),
      ...view.enhancementGroups.map((item): SuEntry => ({ kind: 'enhancement', item })),
      ...view.crossResonances.map((item): SuEntry => ({ kind: 'cross', item }))
    ].sort((left, right) => left.item.order - right.item.order);
  }

  function suEntryPath(entry: SuEntry): number {
    return entry.kind === 'cross' ? entry.item.main.path.rawType : entry.item.path.rawType;
  }

  function filterBlessings(items: RogueBlessing[], path: number | undefined): RogueBlessing[] {
    return path === undefined ? items : items.filter((item) => item.path.rawType === path);
  }

  function filterEquations(items: RogueEquation[], path: number | undefined): RogueEquation[] {
    return path === undefined ? items : items.filter((item) => item.main.path.rawType === path);
  }

  $: suEntries = data.rogue.kind === 'su' ? buildSuEntries(data.rogue) : [];
  $: visibleSuEntries =
    suPath === undefined ? suEntries : suEntries.filter((entry) => suEntryPath(entry) === suPath);
  $: duBlessings =
    data.rogue.kind === 'du' ? filterBlessings(data.rogue.blessings, duBlessingPath) : [];
  $: duEquations =
    data.rogue.kind === 'du' ? filterEquations(data.rogue.equations, duEquationPath) : [];
  $: totalCount =
    data.rogue.kind === 'du'
      ? data.rogue.blessings.length + data.rogue.equations.length
      : suEntries.length;
</script>

<svelte:head>
  <title>{data.rogue.label}｜Rogue｜星轨档案库</title>
  <meta
    name="description"
    content={`${data.rogue.label}的祝福、方程、命途回响、回响构音与回响交错图鉴。`}
  />
</svelte:head>

<RogueModeNav activeMode={data.rogue.mode} />

<header class="page-heading rogue-heading">
  <div>
    <p class="kicker">ROGUE ARCHIVE</p>
    <h2>{data.rogue.label}</h2>
    <p>
      {#if data.rogue.kind === 'du'}祝福与方程按命途独立筛选。{:else}祝福、命途回响、回响构音与回响交错按原始顺序连续展示。{/if}
    </p>
  </div>
  <span class="count-badge">{totalCount} 项</span>
</header>

{#if data.rogue.kind === 'su'}
  <p class="rogue-notice" data-su-catalog-notice>
    普通祝福使用三个模拟宇宙模式共享的完整 162
    项图鉴；它不是当前模式的精确掉落池。命途回响与回响交错则按模式归属展示。
  </p>

  <div class="filter-panel">
    <span>命途</span>
    <RoguePathFilter paths={data.rogue.paths} bind:value={suPath} label="模拟宇宙命途筛选" />
  </div>

  <section
    class="rogue-card-list"
    aria-label={`${data.rogue.label}祝福图鉴`}
    data-su-continuous-flow
  >
    {#each visibleSuEntries as entry (`${entry.kind}:${entry.item.id}`)}
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
{:else}
  <p class="rogue-notice" data-du-revision>
    当前数据明确映射到「{data.rogue.revisionLabel}」（Tourn3），不合并其他版本中的同名修订。
  </p>

  <section class="rogue-section" aria-labelledby="du-blessings-title">
    <div class="section-heading">
      <div>
        <p class="kicker">BLESSINGS</p>
        <h2 id="du-blessings-title">祝福</h2>
      </div>
      <span>{duBlessings.length} / {data.rogue.blessings.length}</span>
    </div>
    <div class="filter-panel">
      <span>祝福命途</span>
      <RoguePathFilter
        paths={data.rogue.paths}
        bind:value={duBlessingPath}
        label="差分宇宙祝福命途筛选"
      />
    </div>
    <div class="rogue-card-list" data-du-blessings>
      {#each duBlessings as blessing (blessing.id)}
        <RogueBlessingCard {blessing} />
      {/each}
    </div>
  </section>

  <section class="rogue-section" aria-labelledby="du-equations-title">
    <div class="section-heading">
      <div>
        <p class="kicker">EQUATIONS</p>
        <h2 id="du-equations-title">方程</h2>
      </div>
      <span>{duEquations.length} / {data.rogue.equations.length}</span>
    </div>
    <div class="filter-panel">
      <span>方程主命途</span>
      <RoguePathFilter
        paths={data.rogue.paths}
        bind:value={duEquationPath}
        label="差分宇宙方程主命途筛选"
      />
    </div>
    <div class="rogue-card-list" data-du-equations>
      {#each duEquations as equation (equation.id)}
        <RogueEquationCard {equation} />
      {/each}
    </div>
  </section>
{/if}

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
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-control);
    margin: 0 0 var(--space-5);
    padding: 0.8rem 1rem;
    background: rgb(215 181 109 / 6%);
    color: var(--text-secondary);
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
    letter-spacing: 0.08em;
  }
  .rogue-card-list {
    display: grid;
    min-width: 0;
    gap: var(--space-4);
  }
  .rogue-section + .rogue-section {
    margin-top: var(--space-8);
  }
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-4);
    border-bottom: 1px solid var(--surface-border);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
  }
  .section-heading h2 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: var(--font-section-title);
  }
  .section-heading > span {
    color: var(--text-muted);
    font-size: var(--font-helper);
  }
  @media (max-width: 520px) {
    .rogue-card-list {
      gap: var(--space-3);
    }
    .rogue-section + .rogue-section {
      margin-top: var(--space-6);
    }
  }
</style>
