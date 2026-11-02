<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { createEndgameClock } from '$lib/client/endgame-clock';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgameSeasonCard from '$lib/components/endgame/EndgameSeasonCard.svelte';
  import { groupEndgamePeriods, refreshEndgameMode } from '$lib/domain/endgame-view';
  import { formatDocumentTitle } from '$lib/site';
  import { m } from '$lib/paraglide/messages.js';
  export let data;

  const clock = createEndgameClock(() => data.mode.periods);
  onMount(clock.mount);
  afterNavigate(clock.refresh);
  $: mode = $clock === undefined ? data.mode : refreshEndgameMode(data.mode, $clock);
  $: periodGroups = groupEndgamePeriods(mode.periods);
</script>

<svelte:head>
  <title>{formatDocumentTitle(m.endgame_archive_title({ mode: data.mode.label }))}</title>
  <meta name="description" content={m.endgame_archive_description({ mode: data.mode.label })} />
</svelte:head>

<EndgameModeNav activeMode={data.mode.mode} />

<h1 class="sr-only">{m.endgame_archive_title({ mode: data.mode.label })}</h1>

<div class="endgame-archive grid min-w-0 gap-8">
  {#if periodGroups.current.length}
    <section class="endgame-archive-section min-w-0" aria-labelledby="endgame-current-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-current-periods"
        >{m.endgame_period_current()}</SectionHeading
      >
      <div class="endgame-archive-featured-list grid min-w-0 gap-4">
        {#each periodGroups.current as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="current" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.upcoming.length}
    <section class="endgame-archive-section min-w-0" aria-labelledby="endgame-upcoming-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-upcoming-periods"
        >{m.endgame_period_upcoming()}</SectionHeading
      >
      <div class="endgame-archive-featured-list grid min-w-0 gap-4">
        {#each periodGroups.upcoming as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="upcoming" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.unknown.length}
    <section class="endgame-archive-section min-w-0" aria-labelledby="endgame-unknown-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-unknown-periods"
        >{m.endgame_period_unknown()}</SectionHeading
      >
      <div
        class="endgame-archive-grid grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3"
      >
        {#each periodGroups.unknown as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="unknown" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.historical.length}
    <section class="endgame-archive-section min-w-0" aria-labelledby="endgame-historical-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-historical-periods"
        >{m.endgame_period_historical()}</SectionHeading
      >
      <div
        class="endgame-archive-grid grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3"
      >
        {#each periodGroups.historical as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="historical" />
        {/each}
      </div>
    </section>
  {/if}
</div>
