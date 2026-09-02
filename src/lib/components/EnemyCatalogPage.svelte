<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ENEMY_RANK_CATEGORIES,
    compareEnemyOverviewEntries,
    hasEnemyOverviewFilters,
    isEnemyCatalogEntry,
    matchesEnemyOverviewFilters,
    readEnemyOverviewFilterState,
    writeEnemyOverviewFilterState,
    type EnemyOverviewFilterState
  } from '$lib/domain/enemy-overview';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import type { CatalogEntry, EnemyCatalogEntry } from '$lib/domain/types';
  import { formatDocumentTitle } from '$lib/site';
  import EnemyOverviewCard from './EnemyOverviewCard.svelte';
  import FilterGroup from './FilterGroup.svelte';
  import OverviewGrid from './OverviewGrid.svelte';
  import OverviewHero from './OverviewHero.svelte';
  import OverviewPagination from './OverviewPagination.svelte';
  import OverviewSearch from './OverviewSearch.svelte';
  import OverviewToolbar from './OverviewToolbar.svelte';

  export let entries: CatalogEntry[] = [];
  export let title = '敌方单位';
  export let description = '浏览、搜索并筛选敌方单位资料。';
  export let enemyPortraits: Record<string, string> = {};

  const heroEnemyIds = ['1005010', '2004010', '4034010'] as const;

  let draftQuery = '';
  let synchronizedQuery: string | undefined;
  let clientReady = false;
  onMount(() => (clientReady = true));

  $: enemies = entries.map(enemyEntry);
  $: params = clientReady ? new URLSearchParams($page.url.searchParams) : new URLSearchParams();
  $: appliedQuery = params.get('q') ?? '';
  $: synchronizeDraft(appliedQuery);
  $: filterState = readEnemyOverviewFilterState(params);
  $: sort = params.get('sort') ?? 'rarity';
  $: requestedPage = Number(params.get('page') ?? 1);
  $: heroArtwork = heroEnemyIds.flatMap((id) =>
    enemyPortraits[id] ? [{ id, url: enemyPortraits[id] }] : []
  );
  $: filtered = enemies
    .filter((entry) => {
      const query = appliedQuery.trim().toLocaleLowerCase();
      return (
        (!query ||
          gameTextToPlain(`${entry.name} ${entry.description ?? ''}`)
            .toLocaleLowerCase()
            .includes(query)) &&
        matchesEnemyOverviewFilters(entry, filterState)
      );
    })
    .sort((a, b) => compareEnemyOverviewEntries(a, b, sort, filterState.weaknesses));
  const pageSize = 48;
  $: pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  $: currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  $: visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  $: weaknessOptions = [
    ...new Map(
      enemies.flatMap((entry) =>
        entry.weaknesses.map((weakness) => [weakness.element, weakness.name] as const)
      )
    ).entries()
  ]
    .sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'))
    .map(([value, label]) => ({ value, label }));

  function enemyEntry(entry: CatalogEntry): EnemyCatalogEntry {
    if (!isEnemyCatalogEntry(entry)) throw new Error(`敌方单位目录 ${entry.id} 缺少弱点投影`);
    return entry;
  }

  function synchronizeDraft(query: string) {
    if (query === synchronizedQuery) return;
    synchronizedQuery = query;
    draftQuery = query;
  }

  async function navigate(next: URLSearchParams) {
    const query = next.toString();
    await goto(`${$page.url.pathname}${query ? `?${query}` : ''}${$page.url.hash}`, {
      noScroll: true,
      keepFocus: true
    });
  }

  async function submitQuery() {
    const next = new URLSearchParams(params);
    const query = draftQuery.trim();
    if (query) next.set('q', query);
    else next.delete('q');
    next.delete('page');
    await navigate(next);
  }

  async function toggleFilter(category: keyof EnemyOverviewFilterState, value: string | undefined) {
    const nextState: EnemyOverviewFilterState = {
      types: new Set(filterState.types),
      weaknesses: new Set(filterState.weaknesses)
    };
    const selected = nextState[category];
    if (value === undefined) selected.clear();
    else if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    await navigate(writeEnemyOverviewFilterState(params, nextState));
  }

  async function clearFilters() {
    await navigate(
      writeEnemyOverviewFilterState(params, { types: new Set(), weaknesses: new Set() })
    );
  }

  async function clearSearchAndFilters() {
    await navigate(new URLSearchParams());
  }
</script>

<svelte:head>
  <title>{formatDocumentTitle(title)}</title>
  <meta name="description" content={description} />
</svelte:head>

<OverviewHero
  eyebrow="DATABASE / ENEMIES"
  {title}
  {description}
  countLabel={`共 ${enemies.length} 个敌方单位`}
  artwork={heroArtwork}
/>

<section class="overview-controls" aria-label="敌方单位搜索与筛选">
  <OverviewSearch
    id="enemy-search-input"
    bind:value={draftQuery}
    placeholder="搜索敌方单位"
    onSubmit={submitQuery}
  />

  <div class="overview-filters">
    <FilterGroup
      id="enemy-type"
      label="敌人类型"
      options={ENEMY_RANK_CATEGORIES.map((option) => ({
        value: option.code,
        label: option.filterLabel
      }))}
      selected={filterState.types}
      onToggle={(value) => toggleFilter('types', value)}
    />
    <FilterGroup
      id="enemy-weakness"
      label="弱点属性"
      iconKind="element"
      options={weaknessOptions}
      selected={filterState.weaknesses}
      onToggle={(value) => toggleFilter('weaknesses', value)}
    />
  </div>

  <OverviewToolbar
    resultCount={filtered.length}
    hasFilters={hasEnemyOverviewFilters(filterState)}
    {sort}
    onClearFilters={clearFilters}
    onSortChange={(value) => {
      const next = new URLSearchParams(params);
      next.set('sort', value);
      next.delete('page');
      return navigate(next);
    }}
  />
</section>

{#if visible.length}
  <OverviewGrid>
    {#each visible as entry (entry.id)}
      <EnemyOverviewCard
        {entry}
        href={`/enemies/${entry.id}`}
        imageUrl={enemyPortraits[entry.id]}
      />
    {/each}
  </OverviewGrid>
  <OverviewPagination {currentPage} {pages} queryString={params.toString()} />
{:else}
  <section class="empty-state">
    <h2>没有匹配结果</h2>
    <p>尝试减少筛选条件，或清空当前搜索。</p>
    <button class="button" type="button" on:click={clearSearchAndFilters}>清空筛选</button>
  </section>
{/if}

<style>
  .overview-controls {
    display: grid;
    gap: 1.4rem;
    margin-bottom: 1.8rem;
  }

  .overview-filters {
    display: grid;
    gap: 1.25rem;
  }
</style>
