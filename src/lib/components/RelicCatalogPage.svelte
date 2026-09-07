<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { localizedHref } from '$lib/i18n/routing';
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
  import { formatDocumentTitle } from '$lib/site';
  import FilterGroup from './FilterGroup.svelte';
  import OverviewGrid from './OverviewGrid.svelte';
  import OverviewHero from './OverviewHero.svelte';
  import OverviewPagination from './OverviewPagination.svelte';
  import OverviewSearch from './OverviewSearch.svelte';
  import OverviewToolbar from './OverviewToolbar.svelte';
  import RelicOverviewCard from './RelicOverviewCard.svelte';
  import { relicCategoryLabel } from '$lib/i18n/product';

  export let entries: CatalogEntry[] = [];
  export let title: string = m.relics_title();
  export let description: string = m.relics_description();

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

  const relicCategoryOptions: Array<{ value: RelicSetCategory; label: string }> = [
    { value: 'cavern', label: relicCategoryLabel('cavern') },
    { value: 'planar', label: relicCategoryLabel('planar') }
  ];

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
  <title>{formatDocumentTitle(title)}</title>
  <meta name="description" content={description} />
</svelte:head>

<OverviewHero
  eyebrow={m.relics_eyebrow()}
  {title}
  {description}
  countLabel={m.relics_count({ count: relics.length })}
  artwork={heroArtwork}
/>

<section class="overview-controls" aria-label={m.relics_controls_aria()}>
  <OverviewSearch
    id="relic-search-input"
    bind:value={draftQuery}
    placeholder={m.relics_search_placeholder()}
    onSubmit={submitQuery}
  />

  <div class="overview-filters">
    <FilterGroup
      id="relic-category"
      label={m.filter_relic_category()}
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
  <OverviewGrid variant="compact">
    {#each visible as relic (relic.id)}
      <RelicOverviewCard
        entry={relic}
        href={localizedHref(`/relics/${relic.id}`)}
        imageUrl={getRelicSetIconUrl(relic.id)}
      />
    {/each}
  </OverviewGrid>
  <OverviewPagination {currentPage} {pages} queryString={params.toString()} />
{:else}
  <section class="empty-state">
    <h2>{m.overview_empty_title()}</h2>
    <p>{m.overview_empty_description()}</p>
    <button class="button" type="button" on:click={clearSearchAndFilters}
      >{m.overview_clear_filters()}</button
    >
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
