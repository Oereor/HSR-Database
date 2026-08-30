<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import CharacterOverviewCard from './CharacterOverviewCard.svelte';
  import FilterGroup from './FilterGroup.svelte';
  import OverviewHero from './OverviewHero.svelte';
  import type { CatalogEntry } from '$lib/domain/types';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    hasCharacterFilters,
    matchesCharacterFilters,
    readCharacterFilterState,
    writeCharacterFilterState,
    type CharacterFilterState
  } from '$lib/domain/character-filters';
  import { getCharacterPreviewUrl } from '$lib/data/visual-assets';

  export let entries: CatalogEntry[] = [];
  export let title = '角色';
  export let description = '浏览、搜索并筛选角色资料。';

  let draftQuery = '';
  let synchronizedQuery: string | undefined;
  let clientReady = false;
  onMount(() => (clientReady = true));

  $: params = clientReady ? new URLSearchParams($page.url.searchParams) : new URLSearchParams();
  $: appliedQuery = params.get('q') ?? '';
  $: synchronizeDraft(appliedQuery);
  $: filterState = readCharacterFilterState(params);
  $: sort = params.get('sort') ?? 'rarity';
  $: requestedPage = Number(params.get('page') ?? 1);
  $: filtered = entries
    .filter((entry) => {
      const query = appliedQuery.trim().toLocaleLowerCase();
      return (
        (!query ||
          gameTextToPlain(`${entry.name} ${entry.description ?? ''}`)
            .toLocaleLowerCase()
            .includes(query)) &&
        matchesCharacterFilters(entry, filterState)
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

  const options = (key: 'path' | 'element' | 'rarity', labelKey?: 'pathName' | 'elementName') =>
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

  function searchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitQuery();
  }

  async function toggleFilter(category: keyof CharacterFilterState, value: string | undefined) {
    const nextState: CharacterFilterState = {
      paths: new Set(filterState.paths),
      elements: new Set(filterState.elements),
      rarities: new Set(filterState.rarities)
    };
    const selected = nextState[category];
    if (value === undefined) selected.clear();
    else if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    await navigate(writeCharacterFilterState(params, nextState));
  }

  async function clearFilters() {
    await navigate(
      writeCharacterFilterState(params, {
        paths: new Set(),
        elements: new Set(),
        rarities: new Set()
      })
    );
  }

  async function clearSearchAndFilters() {
    await navigate(new URLSearchParams());
  }

  function pageUrl(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(nextPage));
    return `?${next}`;
  }
</script>

<svelte:head>
  <title>{title}｜星轨档案库</title>
  <meta name="description" content={description} />
</svelte:head>

<OverviewHero {entries} {title} {description} />

<section class="character-controls" aria-label="角色搜索与筛选">
  <form class="character-search" on:submit|preventDefault={submitQuery}>
    <label for="character-search-input">搜索</label>
    <div class="character-search__control">
      <input
        id="character-search-input"
        bind:value={draftQuery}
        placeholder="搜索角色"
        on:keydown={searchKeydown}
      />
      <button type="submit" class="button">搜索</button>
    </div>
  </form>

  <div class="character-filters">
    <FilterGroup
      label="命途"
      kind="path"
      options={options('path', 'pathName')}
      selected={filterState.paths}
      onToggle={(value) => toggleFilter('paths', value)}
    />
    <FilterGroup
      label="属性"
      kind="element"
      options={options('element', 'elementName')}
      selected={filterState.elements}
      onToggle={(value) => toggleFilter('elements', value)}
    />
    <FilterGroup
      label="稀有度"
      kind="rarity"
      options={options('rarity').map((option) => ({ ...option, label: `${option.label}★` }))}
      selected={filterState.rarities}
      onToggle={(value) => toggleFilter('rarities', value)}
    />
  </div>

  <div class="character-controls__summary">
    <span>共 {filtered.length} 个结果</span>
    {#if hasCharacterFilters(filterState)}
      <button type="button" class="button button--quiet" on:click={clearFilters}>清除筛选</button>
    {/if}
    <label class="character-sort">
      <span>排序</span>
      <select
        value={sort}
        aria-label="排序"
        on:change={(event) => {
          const next = new URLSearchParams(params);
          next.set('sort', (event.currentTarget as HTMLSelectElement).value);
          next.delete('page');
          navigate(next);
        }}
      >
        <option value="rarity">稀有度</option>
        <option value="name">名称</option>
        <option value="id">ID</option>
      </select>
    </label>
  </div>
</section>

{#if visible.length}
  <div class="entity-grid entity-grid--overview character-grid">
    {#each visible as entry (entry.id)}
      <CharacterOverviewCard
        {entry}
        href={`/characters/${entry.id}`}
        imageUrl={getCharacterPreviewUrl(entry.id)}
        density="compact"
      />
    {/each}
  </div>
  {#if pages > 1}
    <nav class="pagination" aria-label="分页">
      {#if currentPage > 1}<a href={pageUrl(currentPage - 1)}>上一页</a>{/if}
      <div class="pagination__pages">
        {#each [...Array(pages).keys()] as pageIndex}
          <a
            href={pageUrl(pageIndex + 1)}
            aria-current={currentPage === pageIndex + 1 ? 'page' : undefined}
          >
            {pageIndex + 1}
          </a>
        {/each}
      </div>
      <span>第 {currentPage} / {pages} 页</span>
      {#if currentPage < pages}<a href={pageUrl(currentPage + 1)}>下一页</a>{/if}
    </nav>
  {/if}
{:else}
  <section class="empty-state">
    <h2>没有匹配结果</h2>
    <p>尝试减少筛选条件，或清空当前搜索。</p>
    <button class="button" type="button" on:click={clearSearchAndFilters}>清空筛选</button>
  </section>
{/if}

<style>
  .character-controls {
    display: grid;
    gap: 1.4rem;
    margin-bottom: 1.8rem;
  }

  .character-search {
    display: grid;
    gap: 0.5rem;
  }

  .character-search > label,
  .character-sort > span {
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-weight: 700;
  }

  .character-search__control {
    display: flex;
    gap: 0.5rem;
  }

  .character-search__control input {
    min-width: 0;
    flex: 1;
  }

  .character-filters {
    display: grid;
    gap: 1.25rem;
  }

  .character-controls__summary {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    color: var(--text-muted);
    font-size: var(--font-helper);
  }

  .character-sort {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .character-sort select {
    padding: 0.42rem 0.55rem;
    font-size: var(--font-helper);
  }

  .entity-grid.entity-grid--overview.character-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 218px), 1fr));
    justify-content: stretch;
    gap: 0.85rem;
  }

  @media (min-width: 1350px) {
    .entity-grid.entity-grid--overview.character-grid {
      grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
    }
  }

  @media (max-width: 520px) {
    .character-search__control {
      align-items: stretch;
      flex-direction: column;
    }

    .character-search__control .button {
      width: 100%;
    }

    .entity-grid.entity-grid--overview.character-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.65rem;
    }
  }

  @media (max-width: 340px) {
    .entity-grid.entity-grid--overview.character-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
