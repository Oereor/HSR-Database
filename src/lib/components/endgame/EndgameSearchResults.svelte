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
    windowEndgameSeasons
  } from '$lib/search/presentation';
  import EndgameEnemyGrid from './EndgameEnemyGrid.svelte';

  export let results: EndgameSearchResults;
  export let encounterLabels: Record<string, Record<string, string>>;
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
        encounters: groupEndgameSearchEncounters(enemies)
      }))
    };
  }).filter(({ total }) => total > 0);
</script>

<section aria-labelledby="endgame-search-occurrences" class="grid min-w-0 gap-6">
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
        <section
          aria-labelledby={`endgame-search-occurrences-${mode}-${period.groupId}`}
          class="border-border grid min-w-0 gap-4 rounded-lg border p-4"
        >
          <SectionHeading level={3} id={`endgame-search-occurrences-${mode}-${period.groupId}`}>
            <GameText text={period.name} />
          </SectionHeading>
          {#each encounters as { id, positions } (id)}
            <div class="grid min-w-0 gap-3" data-endgame-search-encounter>
              <Button
                variant="link"
                class="h-auto justify-self-start p-0 text-start whitespace-normal"
                href={localizedHref(
                  `/endgame/${mode}/${period.groupId}${endgameEncounterHref(id)}`,
                  locale
                )}
              >
                <GameText
                  text={encounterLabels[seasonKey]?.[id] ??
                    m.endgame_local_stage_current({ label: id }, { locale })}
                />
              </Button>
              {#each positions as position (position.key)}
                <div class="grid min-w-0 gap-2">
                  <p class="text-muted-foreground m-0 text-sm">
                    {m.endgame_node({ number: position.node }, { locale })}
                    ·
                    {m.endgame_stage_wave(
                      {
                        stage: position.stage,
                        wave: m.endgame_wave({ number: position.wave }, { locale })
                      },
                      { locale }
                    )}
                  </p>
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
