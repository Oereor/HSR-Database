<script lang="ts">
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgameSeasonCard from '$lib/components/endgame/EndgameSeasonCard.svelte';
  import { groupEndgamePeriods } from '$lib/domain/endgame-view';
  export let data;

  $: periodGroups = groupEndgamePeriods(data.mode.periods);
</script>

<svelte:head>
  <title>{data.mode.label}赛期｜星轨档案库</title>
  <meta name="description" content={`浏览${data.mode.label}的当前、未来与历史赛期。`} />
</svelte:head>

<header class="endgame-page-header">
  <a class="back-link endgame-breadcrumb" href="/endgame">← Endgame</a>
</header>

<EndgameModeNav activeMode={data.mode.mode} />

<h1 class="sr-only">{data.mode.label}赛期</h1>

<div class="endgame-archive">
  {#if periodGroups.current.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-current-periods">
      <div class="endgame-archive-section__heading">
        <h2 id="endgame-current-periods">当前赛期</h2>
        <span aria-hidden="true"></span>
      </div>
      <div class="endgame-archive-featured-list">
        {#each periodGroups.current as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="current" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.upcoming.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-upcoming-periods">
      <div class="endgame-archive-section__heading">
        <h2 id="endgame-upcoming-periods">即将开放</h2>
        <span aria-hidden="true"></span>
      </div>
      <div class="endgame-archive-featured-list">
        {#each periodGroups.upcoming as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="upcoming" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.unknown.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-unknown-periods">
      <div class="endgame-archive-section__heading">
        <h2 id="endgame-unknown-periods">时间未知</h2>
        <span aria-hidden="true"></span>
      </div>
      <div class="endgame-archive-grid">
        {#each periodGroups.unknown as period (period.groupId)}
          <EndgameSeasonCard mode={data.mode.mode} {period} variant="unknown" />
        {/each}
      </div>
    </section>
  {/if}

  {#if periodGroups.historical.length}
    <section class="endgame-archive-section" aria-labelledby="endgame-historical-periods">
      <div class="endgame-archive-section__heading">
        <h2 id="endgame-historical-periods">历史赛期</h2>
        <span aria-hidden="true"></span>
      </div>
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

  .endgame-archive-section__heading {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .endgame-archive-section__heading h2 {
    flex: 0 0 auto;
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-major-title);
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  .endgame-archive-section__heading span {
    height: 1px;
    flex: 1 1 auto;
    background: color-mix(in srgb, var(--border) 72%, transparent);
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
