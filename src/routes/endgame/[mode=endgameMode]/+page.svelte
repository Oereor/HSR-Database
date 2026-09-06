<script lang="ts">
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgameSeasonCard from '$lib/components/endgame/EndgameSeasonCard.svelte';
  import { groupEndgamePeriods } from '$lib/domain/endgame-view';
  import { formatDocumentTitle } from '$lib/site';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  export let data;

  $: periodGroups = groupEndgamePeriods(data.mode.periods);
</script>

<svelte:head>
  <title>{formatDocumentTitle(m.endgame_archive_title({ mode: data.mode.label }))}</title>
  <meta name="description" content={m.endgame_archive_description({ mode: data.mode.label })} />
</svelte:head>

<header class="endgame-page-header">
  <a class="back-link endgame-breadcrumb" href={localizedHref('/endgame')}
    >← {m.endgame_overview_back()}</a
  >
</header>

<EndgameModeNav activeMode={data.mode.mode} />

<h1 class="sr-only">{m.endgame_archive_title({ mode: data.mode.label })}</h1>

<div class="endgame-archive">
  {#if periodGroups.current.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-current-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-current-periods"
        >{m.endgame_period_current()}</SectionHeading
      >
      <div class="endgame-archive-featured-list">
        {#each periodGroups.current as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="current" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.upcoming.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-upcoming-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-upcoming-periods"
        >{m.endgame_period_upcoming()}</SectionHeading
      >
      <div class="endgame-archive-featured-list">
        {#each periodGroups.upcoming as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="upcoming" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.unknown.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-unknown-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-unknown-periods"
        >{m.endgame_period_unknown()}</SectionHeading
      >
      <div class="endgame-archive-grid">
        {#each periodGroups.unknown as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="unknown" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.historical.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-historical-periods">
      <SectionHeading level={2} headingLevel={2} tone="muted" id="endgame-historical-periods"
        >{m.endgame_period_historical()}</SectionHeading
      >
      <div class="endgame-archive-grid">
        {#each periodGroups.historical as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="historical" />
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .endgame-archive {
    display: grid;
    gap: var(--space-12);
  }

  .endgame-archive-section {
    min-width: 0;
  }

  .endgame-archive-featured-list {
    display: grid;
    gap: var(--space-4);
  }

  .endgame-archive-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }

  @media (max-width: 1180px) {
    .endgame-archive-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 820px) {
    .endgame-archive {
      gap: var(--space-10);
    }

    .endgame-archive-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .endgame-archive {
      gap: var(--space-8);
    }

    .endgame-archive-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
