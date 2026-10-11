<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerRelicBuildScoreV2 } from '$lib/player/relic-rating-v2-contract';
  import {
    formatRelicScore,
    formatRelicScorePercent,
    relicScoreUnavailableMessage
  } from '$lib/player/relic-score-presentation';
  export let score: PlayerRelicBuildScoreV2;
</script>

<div
  class="player-relic-score-summary"
  data-player-relic-score-summary
  data-player-algorithm-version="2"
>
  <div class="player-relic-score-summary__overview">
    <div class="player-relic-score-summary__primary">
      <div class="player-relic-score-summary__score">
        <span>{m.player_relic_score_build()}</span>
        <div>
          <strong data-player-build-score
            >{score.status === 'available' ? formatRelicScore(score.score) : '—'}</strong
          >
          {#if score.status === 'available'}<small>/ 100</small>{/if}
        </div>
        {#if score.status === 'unavailable'}<p data-player-build-score-unavailable>
            {relicScoreUnavailableMessage(score.reason)}
          </p>{/if}
      </div>
      <div class="player-relic-score-summary__hits" data-player-effective-hits>
        <span>{m.player_relic_score_effective_hits()}</span>
        {#if score.status === 'available' && score.effectiveHits.status === 'exact' && score.effectiveHits.total !== null}
          <strong>{score.effectiveHits.total}</strong>
        {:else if score.status === 'available' && score.effectiveHits.status === 'partial'}
          <strong>{m.player_relic_score_at_least({ count: score.effectiveHits.known })}</strong>
          <small>{m.player_relic_score_hits_partial()}</small>
        {:else}<strong aria-label={m.player_relic_score_unavailable()}>—</strong>{/if}
      </div>
    </div>
    {#if score.status === 'available'}
      <dl class="player-relic-score-summary__breakdown" data-player-score-breakdown>
        <div>
          <dt>{m.player_relic_score_stat_completion()}</dt>
          <dd>{formatRelicScorePercent(score.statCompletion)}</dd>
        </div>
        <div>
          <dt>{m.player_relic_score_set_integrity()}</dt>
          <dd>{formatRelicScorePercent(score.setIntegrity)}</dd>
        </div>
      </dl>
    {/if}
  </div>
</div>

<style>
  .player-relic-score-summary {
    container-type: inline-size;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-4);
    background: rgb(21 28 44 / 58%);
  }

  .player-relic-score-summary__overview {
    display: grid;
    min-width: 0;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: var(--space-6);
  }

  .player-relic-score-summary__primary {
    display: grid;
    min-width: 0;
    grid-template-columns: max-content max-content;
    align-items: start;
    gap: var(--space-4);
  }

  .player-relic-score-summary__score,
  .player-relic-score-summary__hits {
    display: grid;
    min-width: 0;
    grid-template-rows: minmax(1.3rem, auto) minmax(3.15rem, auto) auto;
    gap: 0.15rem;
  }

  .player-relic-score-summary__hits {
    border-inline-start: 1px solid var(--border);
    padding-inline-start: var(--space-4);
  }

  .player-relic-score-summary__score > span,
  .player-relic-score-summary__hits > span,
  .player-relic-score-summary__breakdown dt {
    color: var(--text-secondary);
    font-size: var(--font-meta-key);
    font-weight: 650;
    white-space: nowrap;
  }

  .player-relic-score-summary__breakdown dt {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .player-relic-score-summary__score > span,
  .player-relic-score-summary__hits > span {
    color: var(--text-body);
    font-weight: 650;
  }

  .player-relic-score-summary__score > div {
    display: flex;
    align-self: end;
    align-items: baseline;
    gap: 0.3rem;
  }

  .player-relic-score-summary__score strong {
    color: var(--gold);
    font-size: clamp(2.15rem, 3vw, 2.65rem);
    font-weight: 750;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .player-relic-score-summary__score small,
  .player-relic-score-summary__hits small,
  .player-relic-score-summary__score p {
    color: var(--faint);
    font-size: var(--font-helper);
  }

  .player-relic-score-summary__score p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .player-relic-score-summary__hits strong {
    align-self: end;
    color: var(--text-primary);
    font-size: clamp(1.8rem, 2.8vw, 2.3rem);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .player-relic-score-summary__breakdown {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: max-content;
    max-width: 100%;
    min-width: 0;
    align-items: start;
    justify-self: end;
    margin: 0;
    padding: var(--space-1) 0;
  }

  .player-relic-score-summary__breakdown > div {
    display: grid;
    min-width: 0;
    gap: 0.1rem;
    text-align: left;
  }

  .player-relic-score-summary__breakdown > div + div {
    margin-inline-start: var(--space-4);
    border-inline-start: 1px solid var(--border);
    padding-inline-start: var(--space-4);
  }

  .player-relic-score-summary__breakdown dd {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-major-title);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @container (max-width: 48rem) {
    .player-relic-score-summary__overview {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
    }

    .player-relic-score-summary__primary {
      grid-template-columns: max-content max-content;
      gap: var(--space-6);
    }

    .player-relic-score-summary__breakdown {
      justify-self: start;
    }
  }

  @container (max-width: 32rem) {
    .player-relic-score-summary__primary {
      grid-template-columns: max-content minmax(0, 1fr);
      gap: var(--space-3);
    }

    .player-relic-score-summary__hits {
      padding-inline-start: var(--space-3);
    }

    .player-relic-score-summary__hits > span {
      white-space: normal;
    }

    .player-relic-score-summary__breakdown > div + div {
      margin-inline-start: var(--space-3);
      padding-inline-start: var(--space-3);
    }
  }
</style>
