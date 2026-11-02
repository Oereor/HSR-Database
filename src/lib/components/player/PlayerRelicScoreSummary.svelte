<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerRelicBuildScoreV2 } from '$lib/player/relic-rating-v2-contract';
  import {
    formatRelicScore,
    formatRelicScorePercent,
    relicScoreUnavailableMessage
  } from '$lib/player/relic-score-presentation';
  export let score: PlayerRelicBuildScoreV2;
</script>

<Card.Root
  size="sm"
  class="@container"
  data-player-relic-score-summary
  data-player-algorithm-version="2"
>
  <Card.Content class="grid grid-cols-2 gap-x-4 gap-y-2 @2xl:grid-cols-4 @2xl:gap-x-6">
    <div class="col-span-2 row-span-2 grid min-w-0 grid-cols-subgrid grid-rows-subgrid">
      <div class="row-span-2 grid min-w-0 grid-rows-subgrid">
        <span class="text-muted-foreground text-sm font-medium wrap-anywhere"
          >{m.player_relic_score_build()}</span
        >
        <div class="flex flex-wrap content-start items-baseline gap-1">
          <strong
            class="text-primary text-4xl leading-none font-bold tabular-nums"
            data-player-build-score
            >{score.status === 'available' ? formatRelicScore(score.score) : '—'}</strong
          >
          {#if score.status === 'available'}<small class="text-muted-foreground text-xs"
              >/ 100</small
            >{/if}
          {#if score.status === 'unavailable'}
            <p
              class="text-muted-foreground m-0 basis-full text-xs wrap-anywhere"
              data-player-build-score-unavailable
            >
              {relicScoreUnavailableMessage(score.reason)}
            </p>
          {/if}
        </div>
      </div>
      <div class="row-span-2 grid min-w-0 grid-rows-subgrid" data-player-effective-hits>
        <span class="text-muted-foreground text-sm font-medium wrap-anywhere"
          >{m.player_relic_score_effective_hits()}</span
        >
        <div class="grid content-start gap-1">
          {#if score.status === 'available' && score.effectiveHits.status === 'exact' && score.effectiveHits.total !== null}
            <strong class="text-2xl leading-none tabular-nums">{score.effectiveHits.total}</strong>
          {:else if score.status === 'available' && score.effectiveHits.status === 'partial'}
            <strong class="text-2xl leading-tight wrap-anywhere tabular-nums"
              >{m.player_relic_score_at_least({ count: score.effectiveHits.known })}</strong
            >
            <small class="text-muted-foreground text-xs"
              >{m.player_relic_score_hits_partial()}</small
            >
          {:else}<strong
              class="text-2xl leading-none"
              aria-label={m.player_relic_score_unavailable()}>—</strong
            >{/if}
        </div>
      </div>
    </div>
    {#if score.status === 'available'}
      <dl
        class="col-span-2 row-span-2 m-0 mt-3 grid min-w-0 grid-cols-subgrid grid-rows-subgrid @2xl:mt-0"
        data-player-score-breakdown
      >
        <div class="row-span-2 grid min-w-0 grid-rows-subgrid">
          <dt class="text-muted-foreground text-sm font-medium wrap-anywhere">
            {m.player_relic_score_stat_completion()}
          </dt>
          <dd class="m-0 text-2xl leading-none font-semibold tabular-nums">
            {formatRelicScorePercent(score.statCompletion)}
          </dd>
        </div>
        <div class="row-span-2 grid min-w-0 grid-rows-subgrid">
          <dt class="text-muted-foreground text-sm font-medium wrap-anywhere">
            {m.player_relic_score_set_integrity()}
          </dt>
          <dd class="m-0 text-2xl leading-none font-semibold tabular-nums">
            {formatRelicScorePercent(score.setIntegrity)}
          </dd>
        </div>
      </dl>
    {/if}
  </Card.Content>
</Card.Root>
