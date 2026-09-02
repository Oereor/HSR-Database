<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import CharacterOverviewCard from '$lib/components/CharacterOverviewCard.svelte';
  import EnemyOverviewCard from '$lib/components/EnemyOverviewCard.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import LightConeOverviewCard from '$lib/components/LightConeOverviewCard.svelte';
  import OverviewGrid from '$lib/components/OverviewGrid.svelte';
  import OverviewHero from '$lib/components/OverviewHero.svelte';
  import RelicOverviewCard from '$lib/components/RelicOverviewCard.svelte';
  import SearchBar from '$lib/components/SearchBar.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import EndgameEnemyGrid from '$lib/components/endgame/EndgameEnemyGrid.svelte';
  import {
    getCharacterPreviewUrl,
    getLightConePreviewUrl,
    getRelicSetIconUrl
  } from '$lib/data/visual-assets';
  import { ENDGAME_MODES, ENDGAME_MODE_META } from '$lib/domain/endgame-view';
  import { createGlobalSearchService, endgameSearchSeasonsForMode } from '$lib/search/search';
  import type { PageData } from './$types';

  export let data: PageData;

  const searchService = createGlobalSearchService(data.searchIndex, {
    characters: data.characters,
    lightCones: data.lightCones,
    relics: data.relics,
    enemies: data.enemies
  });
  let draftQuery = '';
  let appliedQuery = '';
  let results = searchService.search('').results;
  let endgamePending = false;
  let endgameUnavailable = false;
  let requestSequence = 0;
  $: endgameModes = ENDGAME_MODES.map((mode) => ({
    mode,
    label: ENDGAME_MODE_META[mode].label,
    seasons: endgameSearchSeasonsForMode(results.endgame, mode)
  })).filter(({ seasons }) => seasons.length);
  $: resultCount =
    results.characters.length +
    results.lightCones.length +
    results.relics.length +
    results.enemies.length +
    endgameModes.reduce(
      (modeTotal, mode) =>
        modeTotal +
        mode.seasons.reduce((seasonTotal, season) => seasonTotal + season.enemies.length, 0),
      0
    );

  afterNavigate(({ to }) => {
    const nextQuery = to?.url.searchParams.get('q')?.trim() ?? '';
    appliedQuery = nextQuery;
    draftQuery = nextQuery;
    void applyQuery(nextQuery);
  });

  async function applyQuery(query: string) {
    const request = ++requestSequence;
    const snapshot = searchService.search(query);
    results = snapshot.results;
    endgameUnavailable = false;
    endgamePending = snapshot.endgameMatches.length > 0;
    if (!snapshot.endgameMatches.length) return;
    const expanded = await searchService.expandEndgame(snapshot.endgameMatches);
    if (request !== requestSequence) return;
    results = { ...results, endgame: expanded.results };
    endgameUnavailable = expanded.unavailable;
    endgamePending = false;
  }

  async function submitSearch() {
    const nextQuery = draftQuery.trim();
    await goto(`/search${nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : ''}`, {
      noScroll: true,
      keepFocus: true
    });
  }
</script>

<svelte:head>
  <title>全局搜索｜星轨档案库</title>
  <meta name="description" content="跨角色、光锥、遗器和敌方单位的简体中文搜索。" />
</svelte:head>

<OverviewHero
  eyebrow="GLOBAL SEARCH"
  title="全局搜索"
  description="键入关键词以搜索角色、光锥、遗器和敌方单位等内容。"
/>

<div class="search-page-control">
  <SearchBar
    id="search-page-query"
    label="搜索全部资料"
    placeholder="搜索角色、光锥、遗器、敌方单位…"
    bind:value={draftQuery}
    onSubmit={submitSearch}
  />
</div>

{#if appliedQuery && (resultCount || endgameUnavailable)}
  <div class="search-result-groups" aria-live="polite">
    {#if results.characters.length}
      <section class="search-result-section" aria-labelledby="search-results-characters">
        <SectionHeading level={1} id="search-results-characters">角色</SectionHeading>
        <OverviewGrid>
          {#each results.characters as result (result.id)}
            <CharacterOverviewCard
              entry={result}
              href={`/characters/${result.id}`}
              imageUrl={getCharacterPreviewUrl(result.id)}
              density="compact"
            />
          {/each}
        </OverviewGrid>
      </section>
    {/if}

    {#if results.lightCones.length}
      <section class="search-result-section" aria-labelledby="search-results-light-cones">
        <SectionHeading level={1} id="search-results-light-cones">光锥</SectionHeading>
        <OverviewGrid>
          {#each results.lightCones as result (result.id)}
            <LightConeOverviewCard
              entry={result}
              href={`/light-cones/${result.id}`}
              imageUrl={getLightConePreviewUrl(result.id)}
            />
          {/each}
        </OverviewGrid>
      </section>
    {/if}

    {#if results.relics.length}
      <section class="search-result-section" aria-labelledby="search-results-relics">
        <SectionHeading level={1} id="search-results-relics">遗器</SectionHeading>
        <OverviewGrid variant="compact">
          {#each results.relics as result (result.id)}
            <RelicOverviewCard
              entry={result}
              href={`/relics/${result.id}`}
              imageUrl={getRelicSetIconUrl(result.id)}
            />
          {/each}
        </OverviewGrid>
      </section>
    {/if}

    {#if results.enemies.length}
      <section class="search-result-section" aria-labelledby="search-results-enemies">
        <SectionHeading level={1} id="search-results-enemies">敌方单位</SectionHeading>
        <OverviewGrid>
          {#each results.enemies as result (result.id)}
            <EnemyOverviewCard
              entry={result}
              href={`/enemies/${result.id}`}
              imageUrl={data.enemyPortraits[result.id]}
            />
          {/each}
        </OverviewGrid>
      </section>
    {/if}

    {#if endgameModes.length}
      <section class="search-result-section" aria-labelledby="search-results-endgame">
        <SectionHeading level={1} id="search-results-endgame">高难模式</SectionHeading>
        <div class="search-endgame-modes">
          {#each endgameModes as mode (mode.mode)}
            <section
              class="search-endgame-mode"
              aria-labelledby={`search-results-endgame-${mode.mode}`}
            >
              <SectionHeading level={2} id={`search-results-endgame-${mode.mode}`}>
                {mode.label}
              </SectionHeading>
              <div class="search-endgame-seasons">
                {#each mode.seasons as season (season.period.groupId)}
                  <section
                    class="search-endgame-season"
                    aria-labelledby={`search-results-endgame-${mode.mode}-${season.period.groupId}`}
                  >
                    <SectionHeading
                      level={3}
                      id={`search-results-endgame-${mode.mode}-${season.period.groupId}`}
                    >
                      <GameText text={season.period.name} />
                    </SectionHeading>
                    <EndgameEnemyGrid items={season.enemies} />
                  </section>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </section>
    {/if}
    {#if endgameUnavailable}
      <p class="search-data-unavailable" role="status">
        部分高难模式资料暂时无法载入，请稍后重试。
      </p>
    {/if}
  </div>
{:else if appliedQuery && !endgamePending}
  <section class="empty-state" aria-live="polite">
    <h2>未找到与「{appliedQuery}」匹配的结果</h2>
    <p>请尝试使用其他简体中文名称。</p>
  </section>
{:else}
  <section class="search-start">
    <h2>开始探索</h2>
    <p>试试“三月七·存护”、“锋镝”或任意敌方单位名称。</p>
  </section>
{/if}

<style>
  .search-page-control {
    margin-bottom: var(--space-12);
  }

  .search-result-groups {
    display: grid;
    gap: var(--space-16);
  }

  .search-endgame-modes,
  .search-endgame-seasons {
    display: grid;
    min-width: 0;
  }

  .search-endgame-modes {
    gap: var(--space-12);
  }

  .search-endgame-seasons {
    gap: var(--space-8);
  }

  .search-endgame-mode,
  .search-endgame-season {
    min-width: 0;
  }

  .search-start {
    padding: var(--space-16) 0;
    text-align: center;
  }

  .search-start p {
    margin-bottom: 0;
  }

  .search-data-unavailable {
    margin: 0;
    color: var(--text-muted);
    text-align: center;
  }
</style>
