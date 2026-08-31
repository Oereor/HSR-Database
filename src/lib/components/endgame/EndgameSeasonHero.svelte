<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgamePeriodView } from '$lib/domain/endgame-view';

  export let period: EndgamePeriodView;
</script>

<section class="endgame-season-hero" aria-labelledby="endgame-season-title">
  <p class="endgame-season-hero__eyebrow">赛期 ID · {period.groupId}</p>
  <h1 id="endgame-season-title"><GameText text={period.name} /></h1>
  <p class="endgame-season-hero__meta">
    <span>{period.dateLabel}</span>
    {#if period.status === 'current'}
      <span class="endgame-inline-status">当前</span>
    {:else if period.status === 'upcoming'}
      <span class="endgame-inline-status endgame-inline-status--upcoming">即将开放</span>
    {/if}
  </p>
</section>

<style>
  .endgame-season-hero {
    min-width: 0;
    margin-bottom: var(--space-8);
    border-bottom: 1px solid var(--surface-border);
    padding: 0 0 var(--space-6);
  }

  .endgame-season-hero__eyebrow {
    margin: 0 0 var(--space-2);
    color: var(--gold);
    font-size: var(--font-internal);
    font-weight: 750;
    letter-spacing: 0.08em;
  }

  .endgame-season-hero h1 {
    margin: 0 0 var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-section-title);
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .endgame-season-hero__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-body);
    line-height: 1.5;
  }

  @media (max-width: 820px) {
    .endgame-season-hero {
      margin-bottom: var(--space-4);
      padding-bottom: var(--space-4);
    }

    .endgame-season-hero h1 {
      font-size: var(--font-card-category);
    }
  }
</style>
