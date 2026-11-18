<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { createEndgameClock } from '$lib/client/endgame-clock';
  import { m } from '$lib/paraglide/messages.js';
  import * as Alert from '$lib/components/ui/alert';
  import * as Empty from '$lib/components/ui/empty';
  import { Spinner } from '$lib/components/ui/spinner';
  import OverviewHero from '$lib/components/shared/OverviewHero.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import SearchBar from '$lib/components/search/SearchBar.svelte';
  import EndgameOverviewCard from '$lib/components/endgame/EndgameOverviewCard.svelte';
  import EndgameOverviewHeroArtwork from '$lib/components/endgame/EndgameOverviewHeroArtwork.svelte';
  import EndgameSearchResults from '$lib/components/endgame/EndgameSearchResults.svelte';
  import EndgameSeasonCard from '$lib/components/endgame/EndgameSeasonCard.svelte';
  import { refreshEndgameMode, type EndgameModeView } from '$lib/domain/endgame-view';
  import type { GlobalSearchIndex, SearchLocale } from '$lib/domain/search-index';
  import { localizedHref } from '$lib/i18n/routing';
  import { matchEndgamePeriods, type ExpandedEndgameResults } from '$lib/search/endgame';
  import type { createEndgameOccurrenceSearch } from '$lib/search/search';
  import { formatDocumentTitle } from '$lib/site';
  import type { PageData } from './$types';

  export let data: PageData;

  const clock = createEndgameClock(() =>
    data.modes.flatMap((mode: EndgameModeView) => mode.periods)
  );
  onMount(clock.mount);
  $: modes =
    $clock === undefined
      ? data.modes
      : data.modes.map((mode: EndgameModeView) => refreshEndgameMode(mode, $clock!));
  $: regularModes = modes.filter((mode: EndgameModeView) => mode.mode !== 'aa');
  $: arbitration = modes.find((mode: EndgameModeView) => mode.mode === 'aa');

  let draftQuery = '';
  let appliedQuery = '';
  let expanded: ExpandedEndgameResults | undefined;
  let pending = false;
  let indexUnavailable = false;
  let requestSequence = 0;
  const searchByLocale = new Map<
    SearchLocale,
    Promise<ReturnType<typeof createEndgameOccurrenceSearch>>
  >();
  $: periodMatches = matchEndgamePeriods(modes, appliedQuery);
  $: occurrenceMatches =
    expanded && Object.values(expanded.results).some((seasons) => seasons.length > 0);

  afterNavigate(({ to }) => {
    clock.refresh();
    const query = to?.url.searchParams.get('q')?.trim() ?? '';
    draftQuery = query;
    void applyQuery(query);
  });
  onDestroy(() => {
    requestSequence += 1;
  });

  function loadOccurrenceSearch(locale: SearchLocale) {
    let search = searchByLocale.get(locale);
    if (!search) {
      search = Promise.all([
        import('$lib/search/search'),
        fetch(`/generated/${locale}/search.json`).then(async (response) => {
          if (!response.ok) throw new Error(`Endgame 搜索索引加载失败：${response.status}`);
          const index = (await response.json()) as GlobalSearchIndex;
          if (index.locale !== locale) throw new Error(`Endgame 搜索索引语言错误：${locale}`);
          return index;
        })
      ])
        .then(([{ createEndgameOccurrenceSearch }, index]) => createEndgameOccurrenceSearch(index))
        .catch((error: unknown) => {
          searchByLocale.delete(locale);
          throw error;
        });
      searchByLocale.set(locale, search);
    }
    return search;
  }

  async function applyQuery(query: string) {
    const request = ++requestSequence;
    appliedQuery = query;
    expanded = undefined;
    indexUnavailable = false;
    pending = Boolean(query);
    if (!query) return;
    try {
      const search = await loadOccurrenceSearch(data.locale);
      if (request !== requestSequence) return;
      const result = await search(query);
      if (request === requestSequence) expanded = result;
    } catch (error) {
      if (request !== requestSequence) return;
      console.error('Endgame 搜索不可用', error);
      indexUnavailable = true;
    } finally {
      if (request === requestSequence) pending = false;
    }
  }

  async function submitSearch() {
    const query = draftQuery.trim();
    const url = new URL($page.url);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (url.href === $page.url.href) {
      draftQuery = query;
      await applyQuery(query);
      return;
    }
    await goto(url, { noScroll: true, keepFocus: true });
  }
</script>

<svelte:head>
  <title>{formatDocumentTitle(m.endgame_hero_title())}</title>
  <meta name="description" content={m.endgame_hero_description()} />
</svelte:head>

<OverviewHero
  eyebrow={m.endgame_eyebrow()}
  title={m.endgame_hero_title()}
  description={m.endgame_hero_description()}
  countLabel={m.endgame_hero_count()}
>
  <svelte:fragment slot="artwork"><EndgameOverviewHeroArtwork /></svelte:fragment>
</OverviewHero>

<div class="mb-8">
  <SearchBar
    id="endgame-search-query"
    label={m.endgame_search_label({}, { locale: data.locale })}
    placeholder={m.endgame_search_placeholder({}, { locale: data.locale })}
    action={localizedHref('/endgame', data.locale)}
    bind:value={draftQuery}
    onSubmit={submitSearch}
  />
</div>

{#if appliedQuery}
  <div class="grid min-w-0 gap-8">
    {#if periodMatches.length}
      <section aria-labelledby="endgame-search-periods" class="grid min-w-0 gap-4">
        <SectionHeading id="endgame-search-periods">
          {m.endgame_search_periods({}, { locale: data.locale })}
        </SectionHeading>
        {#each periodMatches as { mode, label, periods } (mode)}
          <section aria-labelledby={`endgame-search-periods-${mode}`}>
            <SectionHeading level={2} id={`endgame-search-periods-${mode}`}>{label}</SectionHeading>
            <div
              class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3"
            >
              {#each periods as period (period.groupId)}
                <EndgameSeasonCard {mode} {period} variant={period.status} showStatus />
              {/each}
            </div>
          </section>
        {/each}
      </section>
    {/if}

    {#if occurrenceMatches && expanded}
      <EndgameSearchResults
        results={expanded.results}
        encounterMetadata={data.encounterMetadata}
        locale={data.locale}
      />
    {/if}

    {#if pending}
      <p role="status" class="text-muted-foreground m-0 flex items-center gap-2">
        <Spinner aria-hidden="true" />
        {m.endgame_search_loading({}, { locale: data.locale })}
      </p>
    {:else if indexUnavailable || expanded?.unavailable}
      <Alert.Root>
        <Alert.Description
          >{m.search_endgame_unavailable({}, { locale: data.locale })}</Alert.Description
        >
      </Alert.Root>
    {:else if !periodMatches.length && !occurrenceMatches}
      <Empty.Root tag="section" class="border-border rounded-xl border py-12" aria-live="polite">
        <h2>{m.search_empty_title({ query: appliedQuery }, { locale: data.locale })}</h2>
        <Empty.Description
          >{m.search_empty_description({}, { locale: data.locale })}</Empty.Description
        >
      </Empty.Root>
    {/if}
  </div>
{:else}
  <div class="endgame-overview-sections @container/endgame grid min-w-0 gap-4">
    <div
      class="endgame-overview-grid grid min-w-0 grid-cols-1 gap-4 @min-[48rem]/endgame:grid-cols-3"
    >
      {#each regularModes as mode (mode.mode)}
        <EndgameOverviewCard {mode} />
      {/each}
    </div>

    {#if arbitration}
      <div class="endgame-overview-arbitration">
        <EndgameOverviewCard mode={arbitration} featured />
      </div>
    {/if}
  </div>
{/if}
