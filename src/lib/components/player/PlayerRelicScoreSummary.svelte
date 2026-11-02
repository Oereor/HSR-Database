<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
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
  <Card.Content class="grid gap-4 @3xl:grid-cols-2 @3xl:items-center @3xl:gap-6">
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4">
      <div class="grid min-w-0 gap-2">
        <span class="text-sm font-medium">{m.player_relic_score_build()}</span>
        <div class="flex flex-wrap items-baseline gap-1">
          <strong
            class="text-primary text-4xl leading-none font-bold tabular-nums"
            data-player-build-score
            >{score.status === 'available' ? formatRelicScore(score.score) : '—'}</strong
          >
          {#if score.status === 'available'}<small class="text-muted-foreground text-xs"
              >/ 100</small
            >{/if}
        </div>
        {#if score.status === 'unavailable'}
          <p
            class="text-muted-foreground m-0 text-xs wrap-anywhere"
            data-player-build-score-unavailable
          >
            {relicScoreUnavailableMessage(score.reason)}
          </p>
        {/if}
      </div>
      <Separator orientation="vertical" class="self-stretch data-vertical:h-auto" />
      <div class="grid min-w-0 gap-2" data-player-effective-hits>
        <span class="text-sm font-medium">{m.player_relic_score_effective_hits()}</span>
        {#if score.status === 'available' && score.effectiveHits.status === 'exact' && score.effectiveHits.total !== null}
          <strong class="text-2xl leading-none tabular-nums">{score.effectiveHits.total}</strong>
        {:else if score.status === 'available' && score.effectiveHits.status === 'partial'}
          <strong class="text-2xl leading-tight wrap-anywhere tabular-nums"
            >{m.player_relic_score_at_least({ count: score.effectiveHits.known })}</strong
          >
          <small class="text-muted-foreground text-xs">{m.player_relic_score_hits_partial()}</small>
        {:else}<strong class="text-2xl leading-none" aria-label={m.player_relic_score_unavailable()}
            >—</strong
          >{/if}
      </div>
    </div>
    {#if score.status === 'available'}
      <Separator class="@3xl:hidden" />
      <dl
        class="m-0 grid min-w-0 grid-cols-2 gap-4 @3xl:col-start-2 @3xl:row-start-1"
        data-player-score-breakdown
      >
        <div class="grid min-w-0 gap-1">
          <dt class="text-muted-foreground text-sm wrap-anywhere">
            {m.player_relic_score_stat_completion()}
          </dt>
          <dd class="m-0 text-lg font-semibold tabular-nums">
            {formatRelicScorePercent(score.statCompletion)}
          </dd>
        </div>
        <div class="grid min-w-0 gap-1">
          <dt class="text-muted-foreground text-sm wrap-anywhere">
            {m.player_relic_score_set_integrity()}
          </dt>
          <dd class="m-0 text-lg font-semibold tabular-nums">
            {formatRelicScorePercent(score.setIntegrity)}
          </dd>
        </div>
      </dl>
    {/if}
  </Card.Content>
</Card.Root>
