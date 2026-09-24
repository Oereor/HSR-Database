<script lang="ts">
  import type { RelicProperty } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import { resolvePlayerStatIdentity } from '$lib/player/character';
  import { PLAYER_PROPERTY_SEMANTICS } from '$lib/player/property-semantics';
  import type { PlayerRelicBuildScore } from '$lib/player/relic-score-contract';
  import {
    formatRelicScore,
    formatRelicScorePanelValue,
    formatRelicScorePercent,
    relicScoreUnavailableMessage
  } from '$lib/player/relic-score-presentation';
  import type { RelicStatKey } from '$lib/relic-score/stat-registry';

  export let score: PlayerRelicBuildScore;
  export let properties: RelicProperty[] = [];

  $: propertiesByType = new Map(properties.map((property) => [property.propertyType, property]));
  $: passedBreakpoints =
    score.status === 'available'
      ? score.hardBreakpoint.details.filter((detail) => detail.passed).length
      : 0;

  function statLabel(stat: RelicStatKey): string {
    const field = PLAYER_PROPERTY_SEMANTICS[stat].target;
    const label = resolvePlayerStatIdentity(field, propertiesByType, {
      elation_dmg: m.player_character_stat_elation()
    }).label;
    return label === field ? m.player_relic_score_stat_unknown() : label;
  }
</script>

<div class="player-relic-score-summary" data-player-relic-score-summary>
  <div class="player-relic-score-summary__primary">
    <div class="player-relic-score-summary__score">
      <span>{m.player_relic_score_build()}</span>
      <div>
        <strong data-player-build-score
          >{score.status === 'available' ? formatRelicScore(score.score) : '—'}</strong
        >
        {#if score.status === 'available'}<small>/ 100</small>{/if}
      </div>
      {#if score.status === 'unavailable'}
        <p data-player-build-score-unavailable>{relicScoreUnavailableMessage(score.reason)}</p>
      {/if}
    </div>

    <div class="player-relic-score-summary__hits" data-player-effective-hits>
      <span>{m.player_relic_score_effective_hits()}</span>
      {#if score.status === 'available' && score.effectiveHits.status === 'exact' && score.effectiveHits.total !== null}
        <strong>{score.effectiveHits.total}</strong>
      {:else if score.status === 'available' && score.effectiveHits.status === 'partial'}
        <strong>{m.player_relic_score_at_least({ count: score.effectiveHits.known })}</strong>
        <small>{m.player_relic_score_hits_partial()}</small>
      {:else}
        <strong aria-label={m.player_relic_score_unavailable()}>—</strong>
      {/if}
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
      {#if score.softTarget.details.length}
        <div data-player-soft-target>
          <dt>{m.player_relic_score_soft_target()}</dt>
          <dd>{formatRelicScorePercent(score.softTarget.progress)}</dd>
        </div>
      {/if}
      {#if score.hardBreakpoint.details.length}
        <div data-player-hard-breakpoint>
          <dt>{m.player_relic_score_hard_breakpoint()}</dt>
          <dd>
            {#if score.hardBreakpoint.details.length === 1}
              {score.hardBreakpoint.details[0].passed
                ? m.player_relic_score_passed()
                : m.player_relic_score_failed()}
            {:else}
              {m.player_relic_score_passed_count({
                passed: passedBreakpoints,
                total: score.hardBreakpoint.details.length
              })}
            {/if}
          </dd>
        </div>
      {/if}
    </dl>

    {#if score.softTarget.details.length || score.hardBreakpoint.details.length}
      <details class="player-relic-score-summary__details" data-player-score-details>
        <summary>{m.player_relic_score_details()}</summary>
        <div class="player-relic-score-summary__detail-groups">
          {#if score.softTarget.details.length}
            <section>
              <h4>{m.player_relic_score_soft_target()}</h4>
              {#each score.softTarget.details as detail (detail.stat)}
                <div class="player-relic-score-summary__detail-row" data-score-stat={detail.stat}>
                  <span>{statLabel(detail.stat)}</span>
                  <span
                    >{m.player_relic_score_target_detail({
                      current: formatRelicScorePanelValue(detail.stat, detail.currentValue),
                      minimum: formatRelicScorePanelValue(detail.stat, detail.minimumThreshold),
                      maximum: formatRelicScorePanelValue(detail.stat, detail.maximumThreshold)
                    })}</span
                  >
                  <strong>{formatRelicScorePercent(detail.progress)}</strong>
                </div>
              {/each}
            </section>
          {/if}
          {#if score.hardBreakpoint.details.length}
            <section>
              <h4>{m.player_relic_score_hard_breakpoint()}</h4>
              {#each score.hardBreakpoint.details as detail, index (`${detail.stat}:${index}`)}
                <div class="player-relic-score-summary__detail-row" data-score-stat={detail.stat}>
                  <span>{statLabel(detail.stat)}</span>
                  <span
                    >{m.player_relic_score_breakpoint_detail({
                      current: formatRelicScorePanelValue(detail.stat, detail.currentValue),
                      threshold: formatRelicScorePanelValue(detail.stat, detail.threshold)
                    })}</span
                  >
                  <strong
                    >{detail.passed
                      ? m.player_relic_score_passed()
                      : m.player_relic_score_failed()}</strong
                  >
                </div>
              {/each}
            </section>
          {/if}
        </div>
      </details>
    {/if}
  {/if}
</div>

<style>
  .player-relic-score-summary {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-4);
    background: rgb(21 28 44 / 58%);
  }

  .player-relic-score-summary__primary {
    display: flex;
    min-width: 0;
    align-items: start;
    gap: var(--space-8);
  }

  .player-relic-score-summary__score,
  .player-relic-score-summary__hits {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .player-relic-score-summary__score > span,
  .player-relic-score-summary__hits > span,
  .player-relic-score-summary__breakdown dt {
    color: var(--text-secondary);
    font-size: var(--font-meta-key);
  }

  .player-relic-score-summary__score > div {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
  }

  .player-relic-score-summary__score strong {
    color: var(--text-primary);
    font-size: clamp(1.6rem, 3vw, 2.1rem);
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
    color: var(--text-primary);
    font-size: var(--font-meta-value);
    font-variant-numeric: tabular-nums;
  }

  .player-relic-score-summary__breakdown {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
    margin: var(--space-4) 0 0;
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }

  .player-relic-score-summary__breakdown > div {
    display: grid;
    min-width: 0;
    gap: 0.1rem;
  }

  .player-relic-score-summary__breakdown dd {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-body);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .player-relic-score-summary__details {
    min-width: 0;
    margin-top: var(--space-3);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }

  .player-relic-score-summary__details summary {
    width: fit-content;
    cursor: pointer;
  }

  .player-relic-score-summary__details summary:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
  }

  .player-relic-score-summary__detail-groups {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .player-relic-score-summary__detail-groups h4 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-meta-key);
  }

  .player-relic-score-summary__detail-row {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(5rem, 0.8fr) minmax(0, 2fr) auto;
    gap: var(--space-2);
    padding: 0.25rem 0;
  }

  .player-relic-score-summary__detail-row > * {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .player-relic-score-summary__detail-row strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 680px) {
    .player-relic-score-summary__primary {
      flex-wrap: wrap;
      gap: var(--space-3) var(--space-6);
    }

    .player-relic-score-summary__detail-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .player-relic-score-summary__detail-row > :nth-child(2) {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
