<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameMode } from '$lib/domain/endgame';
  import type { EndgamePeriodView } from '$lib/domain/endgame-view';
  import EndgamePeriodSelector from './EndgamePeriodSelector.svelte';

  export let mode: EndgameMode;
  export let period: EndgamePeriodView;
  export let periods: EndgamePeriodView[];
</script>

<section class="endgame-season-header" aria-labelledby="endgame-season-title">
  <div class="endgame-season-header__identity">
    <h1 id="endgame-season-title"><GameText text={period.name} /></h1>
    <p>
      <span>{period.dateLabel}</span>
      {#if period.status === 'current'}
        <span class="endgame-inline-status">当前</span>
      {:else if period.status === 'upcoming'}
        <span class="endgame-inline-status endgame-inline-status--upcoming">即将开放</span>
      {/if}
    </p>
  </div>
  <EndgamePeriodSelector {mode} {periods} selectedGroupId={period.groupId} />
</section>
