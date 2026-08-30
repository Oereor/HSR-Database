<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getRelicSetIconUrl } from '$lib/data/visual-assets';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    hasRelicFilters,
    isRelicSetCategory,
    matchesRelicFilters,
    readRelicFilterState,
    writeRelicFilterState
  } from '$lib/domain/relic-filters';
  import type { CatalogEntry, RelicCatalogEntry, RelicSetCategory } from '$lib/domain/types';
  import EntityOverviewCard from './EntityOverviewCard.svelte';
  import FilterGroup from './FilterGroup.svelte';
  import GameText from './GameText.svelte';
  import OverviewHero from './OverviewHero.svelte';
  import OverviewPagination from './OverviewPagination.svelte';
  import OverviewSearch from './OverviewSearch.svelte';
  import OverviewToolbar from './OverviewToolbar.svelte';

  export let entries: CatalogEntry[] = [];
  export let title = '遗器';
  export let description = '浏览、搜索并筛选遗器套装资料。';

  let draftQuery = '';
  let synchronizedQuery: string | undefined;
  let clientReady = false;
  onMount(() => (clientReady = true));

  $: relics = entries.map(relicEntry);
  $: params = clientReady ? new URLSearchParams($page.url.searchParams) : new URLSearchParams();
  $: appliedQuery = params.get('q') ?? '';
  $: synchronizeDraft(appliedQuery);
  $: filterState = readRelicFilterState(params);
  $: selectedCategories = new Set<string>(filterState.category ? [filterState.category] : []);
  $: sort = params.get('sort') ?? 'rarity';
  $: requestedPage = Number(params.get('page') ?? 1);
  $: heroArtwork = resolveHeroArtwork(relics);
  $: filtered = relics
    .filter((entry) => {
      const query = appliedQuery.trim().toLocaleLowerCase();
      return (
        (!query ||
          gameTextToPlain(`${entry.name} ${entry.description ?? ''}`)
            .toLocaleLowerCase()
            .includes(query)) &&
        matchesRelicFilters(entry, filterState)
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

  const relicCategoryLabels: Record<RelicSetCategory, string> = {
    cavern: '隧洞遗器',
    planar: '位面饰品'
  };
  const relicCategoryOptions = Object.entries(relicCategoryLabels).map(([value, label]) => ({
    value,
    label
  }));

  function relicEntry(entry: CatalogEntry): RelicCatalogEntry {
    const category = (entry as Partial<RelicCatalogEntry>).category;
    if (!isRelicSetCategory(category)) throw new Error(`遗器目录 ${entry.id} 缺少有效套装分类`);
    return entry as RelicCatalogEntry;
  }

  function resolveHeroArtwork(catalog: RelicCatalogEntry[]): Array<{ id: string; url: string }> {
    const seen = new Set<string>();
    const artwork: Array<{ id: string; url: string }> = [];
    for (const entry of catalog) {
      const url = getRelicSetIconUrl(entry.id);
      if (!url || seen.has(url)) continue;
      artwork.push({ id: entry.id, url });
      seen.add(url);
      if (artwork.length === 3) break;
    }
    return artwork;
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

  async function selectCategory(value: string | undefined) {
    await navigate(
      writeRelicFilterState(params, {
        category: isRelicSetCategory(value) ? value : undefined
      })
    );
  }

  async function clearFilters() {
    await navigate(writeRelicFilterState(params, { category: undefined }));
  }

  async function clearSearchAndFilters() {
    await navigate(new URLSearchParams());
  }
</script>

<svelte:head>
  <title>{title}｜星轨档案库</title>
  <meta name="description" content={description} />
</svelte:head>

<OverviewHero
  eyebrow="DATABASE / RELICS"
  {title}
  {description}
  countLabel={`共 ${relics.length} 套遗器`}
  artwork={heroArtwork}
/>

<section class="overview-controls" aria-label="遗器搜索与筛选">
  <OverviewSearch
    id="relic-search-input"
    bind:value={draftQuery}
    placeholder="搜索遗器套装"
    onSubmit={submitQuery}
  />

  <div class="overview-filters">
    <FilterGroup
      id="relic-category"
      label="遗器类别"
      options={relicCategoryOptions}
      selected={selectedCategories}
      onToggle={selectCategory}
    />
  </div>

  <OverviewToolbar
    resultCount={filtered.length}
    hasFilters={hasRelicFilters(filterState)}
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
  <div class="entity-grid entity-grid--overview entity-grid--overview-compact">
    {#each visible as relic (relic.id)}
      <EntityOverviewCard
        href={`/relics/${relic.id}`}
        imageUrl={getRelicSetIconUrl(relic.id)}
        imageAlt=""
        fallbackLabel={relic.name}
        artworkFit="contain"
        artworkPosition="center"
        size="compact"
        mediaPresentation="icon"
      >
        <svelte:fragment slot="overlay">{relicCategoryLabels[relic.category]}</svelte:fragment>
        <svelte:fragment slot="title"><GameText text={relic.name} /></svelte:fragment>
      </EntityOverviewCard>
    {/each}
  </div>
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
