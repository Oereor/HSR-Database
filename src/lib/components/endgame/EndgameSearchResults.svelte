<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import SearchResultWindow from '$lib/components/search/SearchResultWindow.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { EndgameMode } from '$lib/domain/endgame';
  import { endgameEncounterHref } from '$lib/domain/endgame-navigation';
  import { ENDGAME_MODES } from '$lib/domain/endgame-view';
  import type { SearchLocale } from '$lib/domain/search-index';
  import { getEndgameModeCopy } from '$lib/i18n/endgame';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import { endgameSearchSeasonsForMode, type EndgameSearchResults } from '$lib/search/endgame';
  import {
    groupEndgameSearchEncounters,
    SEARCH_DISPLAY_BATCH,
    windowEndgameSeasons,
    type EndgameSearchSeasonMetadata
  } from '$lib/search/presentation';
  import EndgameEnemyGrid from './EndgameEnemyGrid.svelte';

  export let results: EndgameSearchResults;
  export let encounterMetadata: Record<string, EndgameSearchSeasonMetadata>;
  export let locale: SearchLocale;

  let limits: Partial<Record<EndgameMode, number>> = {};
  $: modes = ENDGAME_MODES.map((mode) => {
    const limit = limits[mode] ?? SEARCH_DISPLAY_BATCH;
    const seasons = endgameSearchSeasonsForMode(results, mode);
    return {
      mode,
      limit,
      total: seasons.reduce((count, { enemies }) => count + enemies.length, 0),
      seasons: windowEndgameSeasons(seasons, limit).map(({ period, enemies }) => ({
        period,
        encounters: groupEndgameSearchEncounters(
          enemies,
          encounterMetadata[`${mode}:${period.groupId}`]
        )
      }))
    };
  }).filter(({ total }) => total > 0);

  function positionLabels(
    { node, stage, wave }: { node?: number; stage?: number; wave?: number },
    locale: SearchLocale
  ): string[] {
    const labels: string[] = [];
    if (node !== undefined) labels.push(m.endgame_node({ number: node }, { locale }));
    if (stage !== undefined) labels.push(m.endgame_search_phase({ number: stage }, { locale }));
    if (wave !== undefined) labels.push(m.endgame_wave({ number: wave }, { locale }));
    return labels;
  }
</script>

<section aria-labelledby="endgame-search-occurrences" class="grid min-w-0 gap-3">
  <SectionHeading id="endgame-search-occurrences">
    {m.endgame_search_occurrences({}, { locale })}
  </SectionHeading>
  {#each modes as { mode, limit, total, seasons } (mode)}
    <section aria-labelledby={`endgame-search-occurrences-${mode}`} class="grid min-w-0 gap-6">
      <SectionHeading level={2} id={`endgame-search-occurrences-${mode}`}>
        {getEndgameModeCopy(mode, locale).label}
      </SectionHeading>
      {#each seasons as { period, encounters } (period.groupId)}
        {@const seasonKey = `${mode}:${period.groupId}`}
        {@const seasonPath = `/endgame/${mode}/${period.groupId}/`}
        {@const seasonHeading = `endgame-search-occurrences-${mode}-${period.groupId}`}
        <section aria-labelledby={seasonHeading} class="grid min-w-0 gap-3">
          <h4 class="text-foreground m-0 text-base font-semibold wrap-anywhere" id={seasonHeading}>
            <a class="hover:text-primary hover:underline" href={localizedHref(seasonPath, locale)}>
              <GameText text={period.name} />
            </a>
          </h4>
          {#each encounters as { id, positions } (id)}
            <div class="grid min-w-0 gap-2" data-endgame-search-encounter>
              <h5 class="m-0">
                <Button
                  variant="link"
                  class="h-auto max-w-full p-0 text-start wrap-anywhere whitespace-normal"
                  href={localizedHref(`${seasonPath}${endgameEncounterHref(id)}`, locale)}
                >
                  <GameText
                    text={encounterMetadata[seasonKey]?.[id]?.label ??
                      m.endgame_local_stage_current({ label: id }, { locale })}
                  />
                </Button>
              </h5>
              {#each positions as position (position.key)}
                {@const labels = positionLabels(position, locale)}
                <div class="grid min-w-0 gap-2">
                  {#if labels.length}
                    <p class="text-muted-foreground m-0 text-sm">{labels.join(' · ')}</p>
                  {/if}
                  <EndgameEnemyGrid items={position.enemies} />
                </div>
              {/each}
            </div>
          {/each}
        </section>
      {/each}
      <SearchResultWindow
        shown={limit}
        {total}
        onLoadMore={() => (limits = { ...limits, [mode]: limit + SEARCH_DISPLAY_BATCH })}
      />
    </section>
  {/each}
</section>
