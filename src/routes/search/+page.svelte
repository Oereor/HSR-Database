<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import { onMount } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import type { SearchEntry } from '$lib/domain/types';
  import { searchEntries } from '$lib/search/search';

  let entries: SearchEntry[] = [];
  let draftQuery = '';
  let appliedQuery = '';
  let active = 0;
  $: results = searchEntries(entries, appliedQuery);
  $: grouped = Object.entries(
    results.reduce<Record<string, SearchEntry[]>>((groups, entry) => {
      groups[entry.kind] = [...(groups[entry.kind] ?? []), entry];
      return groups;
    }, {})
  );

  onMount(async () => {
    entries = await fetch('/generated/search.json').then((response) => response.json());
  });

  afterNavigate(({ to }) => {
    const nextQuery = to?.url.searchParams.get('q')?.trim() ?? '';
    appliedQuery = nextQuery;
    draftQuery = nextQuery;
    active = 0;
  });

  function submitSearch() {
    const nextQuery = draftQuery.trim();
    active = 0;
    goto(`/search${nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : ''}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(active + 1, results.length - 1);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(active - 1, 0);
    }
    if (event.key === 'Escape') {
      draftQuery = '';
      active = 0;
    }
  }
  const labels: Record<string, string> = {
    character: '角色',
    'light-cone': '光锥',
    relic: '遗器',
    enemy: '敌人'
  };
</script>

<svelte:head
  ><title>全局搜索｜星轨档案库</title><meta
    name="description"
    content="跨角色、光锥、遗器和敌人的简体中文搜索。"
  /></svelte:head
>
<header class="page-heading">
  <div>
    <p class="kicker">GLOBAL SEARCH</p>
    <h1>全局搜索</h1>
    <p>使用简体中文名称搜索角色、光锥、遗器和敌人。</p>
  </div>
</header>
<form class="search-page-field" role="search" on:submit|preventDefault={submitSearch}>
  <label for="search-page-query" class="sr-only">搜索全部资料</label>
  <input
    id="search-page-query"
    bind:value={draftQuery}
    on:keydown={keyboard}
    placeholder="输入角色、光锥、遗器或敌人名称"
  />
  <kbd>↑↓</kbd>
  <button type="submit" class="button">搜索</button>
</form>
{#if appliedQuery && entries.length === 0}<p class="loading-state">
    正在载入搜索索引…
  </p>{:else if appliedQuery && results.length === 0}<section class="empty-state">
    <h2>没有找到“{appliedQuery}”</h2>
    <p>可尝试更短的简体中文名称或检查输入内容。</p>
  </section>{:else if results.length}{#each grouped as group}<section class="search-group">
      <div class="section-heading">
        <h2>{labels[group[0]]}</h2>
        <span>{group[1].length}</span>
      </div>
      <div class="search-results">
        {#each group[1] as result}<a
            href={result.href}
            class:active={results.indexOf(result) === active}
            ><strong><GameText text={result.name} /></strong><span
              ><GameText text={result.meta || `ID ${result.id}`} /></span
            ></a
          >{/each}
      </div>
    </section>{/each}{:else}<section class="search-suggestions">
    <h2>开始探索</h2>
    <p>试试“三月七·存护”、“锋镝”或任意敌人名称。</p>
  </section>{/if}
