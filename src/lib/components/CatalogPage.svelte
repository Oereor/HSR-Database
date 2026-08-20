<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import CharacterOverviewCard from './CharacterOverviewCard.svelte';
  import EnemyOverviewCard from './EnemyOverviewCard.svelte';
  import LegacyEntityCard from './LegacyEntityCard.svelte';
  import type { CatalogEntry, EnemyCatalogEntry } from '$lib/domain/types';
  import {
    ENEMY_RANK_CATEGORIES,
    getEnemyRankCategory,
    isEnemyCatalogEntry,
    normalizeEnemyRankFilter
  } from '$lib/domain/enemy-overview';
  import { gameTextToPlain } from '$lib/domain/game-text';

  export let entries: CatalogEntry[];
  export let category: string;
  export let title: string;
  export let description: string;
  export let enemyPortraits: Record<string, string> = {};

  let form: HTMLFormElement;
  let filterTrigger: HTMLButtonElement;
  let filtersOpen = false;
  let draftQuery = '';
  let synchronizedQuery: string | undefined;
  $: params = browser ? new URLSearchParams($page.url.searchParams) : new URLSearchParams();
  const pageSize = category === 'enemies' ? 48 : 36;
  $: appliedQuery = params.get('q') ?? '';
  $: synchronizeDraft(appliedQuery);

  function synchronizeDraft(query: string) {
    if (query === synchronizedQuery) return;
    synchronizedQuery = query;
    draftQuery = query;
  }
  $: q = appliedQuery.trim().toLocaleLowerCase();
  $: rarity = params.get('rarity') ?? '';
  $: path = params.get('path') ?? '';
  $: element = params.get('element') ?? '';
  $: version = params.get('version') ?? '';
  $: type =
    category === 'enemies'
      ? normalizeEnemyRankFilter(params.get('type') ?? '')
      : (params.get('type') ?? '');
  $: sort = params.get('sort') ?? 'rarity';
  $: requestedPage = Number(params.get('page') ?? 1);
  $: filtered = entries
    .filter(
      (entry) =>
        !q ||
        gameTextToPlain(`${entry.name} ${entry.description ?? ''}`)
          .toLocaleLowerCase()
          .includes(q)
    )
    .filter((entry) => !rarity || String(entry.rarity) === rarity)
    .filter((entry) => !path || entry.path === path)
    .filter((entry) => !element || entry.element === element)
    .filter((entry) => !version || entry.version === version)
    .filter(
      (entry) =>
        !type ||
        (category === 'enemies' ? getEnemyRankCategory(entry.type) === type : entry.type === type)
    )
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'id') return Number(a.id) - Number(b.id);
      return (b.rarity ?? 0) - (a.rarity ?? 0) || a.name.localeCompare(b.name, 'zh-CN');
    });
  $: pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  $: currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  $: visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const values = (key: keyof CatalogEntry, labelKey?: keyof CatalogEntry) =>
    [
      ...new Map(
        entries
          .filter((entry) => entry[key])
          .map((entry) => [String(entry[key]), String(entry[labelKey ?? key])])
      ).entries()
    ].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));

  $: typeOptions =
    category === 'enemies'
      ? ENEMY_RANK_CATEGORIES.filter((option) =>
          entries.some((entry) => getEnemyRankCategory(entry.type) === option.code)
        ).map((option) => [option.code, option.label] as const)
      : values('type', 'typeName');

  function enemyEntry(entry: CatalogEntry): EnemyCatalogEntry {
    if (!isEnemyCatalogEntry(entry)) throw new Error(`敌人目录 ${entry.id} 缺少弱点投影`);
    return entry;
  }

  async function submitQuery() {
    const nextParams = new URLSearchParams(params);
    const nextQuery = draftQuery.trim();
    if (nextQuery) nextParams.set('q', nextQuery);
    else nextParams.delete('q');
    nextParams.delete('page');
    filtersOpen = false;
    const query = nextParams.toString();
    await goto(`${$page.url.pathname}${query ? `?${query}` : ''}${$page.url.hash}`, {
      noScroll: true,
      keepFocus: true
    });
  }

  function searchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitQuery();
  }

  async function openFilters() {
    filtersOpen = true;
    await tick();
    form.querySelector<HTMLElement>('input, select, button')?.focus();
  }

  function closeFilters() {
    filtersOpen = false;
    filterTrigger.focus();
  }

  function pageUrl(next: number) {
    const nextParams = new URLSearchParams(params);
    nextParams.set('page', String(next));
    return `?${nextParams}`;
  }
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && filtersOpen && closeFilters()} />

<svelte:head>
  <title>{title}｜星轨档案库</title>
  <meta name="description" content={description} />
</svelte:head>

<header class="page-heading">
  <div>
    <p class="kicker">DATABASE / {category.toUpperCase()}</p>
    <h1>{title}</h1>
    <p>{description}</p>
  </div>
  <span class="count-badge">{filtered.length} 条记录</span>
</header>

<button
  class="mobile-filter-button"
  type="button"
  bind:this={filterTrigger}
  aria-expanded={filtersOpen}
  on:click={openFilters}>筛选与排序</button
>
<input type="hidden" name="q" value={appliedQuery} />

{#if filtersOpen}<button
    class="filter-backdrop"
    type="button"
    aria-label="关闭筛选"
    on:click={closeFilters}
  ></button>{/if}
<form
  class="filters"
  class:filters--open={filtersOpen}
  method="GET"
  bind:this={form}
  role={filtersOpen ? 'dialog' : undefined}
  aria-label="筛选与排序"
  aria-modal={filtersOpen}
  on:submit={() => (filtersOpen = false)}
>
  <div class="filter-drawer-heading">
    <strong>筛选与排序</strong><button type="button" aria-label="关闭筛选" on:click={closeFilters}
      >×</button
    >
  </div>
  <label class="search-field">
    <span>搜索</span>
    <div class="search-field__control">
      <input bind:value={draftQuery} placeholder={`搜索${title}`} on:keydown={searchKeydown} />
      <button type="button" class="button" on:click={submitQuery}>搜索</button>
    </div>
  </label>
  {#if values('rarity').length}
    <label
      ><span>稀有度</span><select
        name="rarity"
        value={rarity}
        on:change={() => form.requestSubmit()}
        ><option value="">全部</option>{#each values('rarity') as option}<option value={option[0]}
            >{option[1]} 星</option
          >{/each}</select
      ></label
    >
  {/if}
  {#if values('path', 'pathName').length}
    <label
      ><span>命途</span><select name="path" value={path} on:change={() => form.requestSubmit()}
        ><option value="">全部</option>{#each values('path', 'pathName') as option}<option
            value={option[0]}>{option[1]}</option
          >{/each}</select
      ></label
    >
  {/if}
  {#if values('element', 'elementName').length}
    <label
      ><span>属性</span><select
        name="element"
        value={element}
        on:change={() => form.requestSubmit()}
        ><option value="">全部</option>{#each values('element', 'elementName') as option}<option
            value={option[0]}>{option[1]}</option
          >{/each}</select
      ></label
    >
  {/if}
  {#if values('version').length}
    <label
      ><span>版本</span><select
        name="version"
        value={version}
        on:change={() => form.requestSubmit()}
        ><option value="">全部</option>{#each values('version') as option}<option value={option[0]}
            >{option[1]}</option
          >{/each}</select
      ></label
    >
  {/if}
  {#if typeOptions.length}
    <label
      ><span>类别</span><select name="type" value={type} on:change={() => form.requestSubmit()}
        ><option value="">全部</option>{#each typeOptions as option}<option value={option[0]}
            >{option[1]}</option
          >{/each}</select
      ></label
    >
  {/if}
  <label
    ><span>排序</span><select name="sort" value={sort} on:change={() => form.requestSubmit()}
      ><option value="rarity">稀有度</option><option value="name">名称</option><option value="id"
        >ID</option
      ></select
    ></label
  >
  <a class="button button--quiet" href={`/${category}`}>清空</a>
</form>

{#if visible.length}
  <div
    class="entity-grid"
    class:entity-grid--overview={category === 'characters' || category === 'enemies'}
  >
    {#each visible as entry (entry.id)}
      {#if category === 'characters'}
        <CharacterOverviewCard {entry} href={`/characters/${entry.id}`} />
      {:else if category === 'enemies'}
        <EnemyOverviewCard
          entry={enemyEntry(entry)}
          href={`/enemies/${entry.id}`}
          imageUrl={enemyPortraits[entry.id]}
        />
      {:else}
        <LegacyEntityCard
          {entry}
          href={`/${category}/${entry.id}`}
          kind={category === 'light-cones' ? 'light-cone' : 'relic'}
        />
      {/if}
    {/each}
  </div>
  {#if pages > 1}
    <nav class="pagination" aria-label="分页">
      {#if currentPage > 1}<a href={pageUrl(currentPage - 1)}>上一页</a>{/if}
      <div class="pagination__pages">
        {#each [...Array(pages).keys()] as pageIndex}
          <a
            href={pageUrl(pageIndex + 1)}
            aria-current={currentPage === pageIndex + 1 ? 'page' : undefined}>{pageIndex + 1}</a
          >
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
    <a class="button" href={`/${category}`}>清空筛选</a>
  </section>
{/if}
