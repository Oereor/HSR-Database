<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getLightConePreviewUrl } from '$lib/data/visual-assets';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    hasLightConeFilters,
    matchesLightConeFilters,
    readLightConeFilterState,
    writeLightConeFilterState,
    type LightConeFilterState
  } from '$lib/domain/light-cone-filters';
  import type { CatalogEntry } from '$lib/domain/types';
  import { formatDocumentTitle } from '$lib/site';
  import FilterGroup from './FilterGroup.svelte';
  import LightConeOverviewCard from './LightConeOverviewCard.svelte';
  import OverviewGrid from './OverviewGrid.svelte';
  import OverviewHero from './OverviewHero.svelte';
  import OverviewPagination from './OverviewPagination.svelte';
  import OverviewSearch from './OverviewSearch.svelte';
  import OverviewToolbar from './OverviewToolbar.svelte';

  export let entries: CatalogEntry[] = [];
  export let title = '光锥';
  export let description = '浏览、搜索并筛选光锥资料。';

  let draftQuery = '';
  let synchronizedQuery: string | undefined;
  let clientReady = false;
  onMount(() => (clientReady = true));

  $: params = clientReady ? new URLSearchParams($page.url.searchParams) : new URLSearchParams();
  $: appliedQuery = params.get('q') ?? '';
  $: synchronizeDraft(appliedQuery);
  $: filterState = readLightConeFilterState(params);
  $: sort = params.get('sort') ?? 'rarity';
  $: requestedPage = Number(params.get('page') ?? 1);
  $: heroArtwork = entries
    .slice(0, 3)
    .map((entry) => ({ id: entry.id, url: getLightConePreviewUrl(entry.id) }))
    .filter((entry): entry is { id: string; url: string } => Boolean(entry.url));
  $: filtered = entries
    .filter((entry) => {
      const query = appliedQuery.trim().toLocaleLowerCase();
      return (
        (!query ||
          gameTextToPlain(`${entry.name} ${entry.description ?? ''}`)
            .toLocaleLowerCase()
            .includes(query)) &&
        matchesLightConeFilters(entry, filterState)
      );
    })
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'id') return Number(a.id) - Number(b.id);
      return (b.rarity ?? 0) - (a.rarity ?? 0) || a.name.localeCompare(b.name, 'zh-CN');
    });
  const pageSize = 36;
  $: pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  $: currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  $: visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const options = (key: 'path' | 'rarity', labelKey?: 'pathName') =>
    [
      ...new Map(
        entries
          .filter((entry) => entry[key] !== undefined)
          .map((entry) => [String(entry[key]), String(labelKey ? entry[labelKey] : entry[key])])
      ).entries()
    ]
      .sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'))
      .map(([value, label]) => ({ value, label }));

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

  async function toggleFilter(category: keyof LightConeFilterState, value: string | undefined) {
    const nextState: LightConeFilterState = {
      paths: new Set(filterState.paths),
      rarities: new Set(filterState.rarities)
    };
    const selected = nextState[category];
    if (value === undefined) selected.clear();
    else if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    await navigate(writeLightConeFilterState(params, nextState));
  }

  async function clearFilters() {
    await navigate(writeLightConeFilterState(params, { paths: new Set(), rarities: new Set() }));
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
  eyebrow="DATABASE / LIGHT CONES"
  {title}
  {description}
  countLabel={`共 ${entries.length} 张光锥`}
  artwork={heroArtwork}
/>

<section class="overview-controls" aria-label="光锥搜索与筛选">
  <OverviewSearch
    id="light-cone-search-input"
    bind:value={draftQuery}
    placeholder="搜索光锥"
    onSubmit={submitQuery}
  />

  <div class="overview-filters">
    <FilterGroup
      id="light-cone-path"
      label="命途"
      iconKind="path"
      options={options('path', 'pathName')}
      selected={filterState.paths}
      onToggle={(value) => toggleFilter('paths', value)}
    />
    <FilterGroup
      id="light-cone-rarity"
      label="稀有度"
      options={options('rarity').map((option) => ({ ...option, label: `${option.label}★` }))}
      selected={filterState.rarities}
      onToggle={(value) => toggleFilter('rarities', value)}
    />
  </div>

  <OverviewToolbar
    resultCount={filtered.length}
    hasFilters={hasLightConeFilters(filterState)}
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
      <LightConeOverviewCard
        {entry}
        href={`/light-cones/${entry.id}`}
        imageUrl={getLightConePreviewUrl(entry.id)}
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
