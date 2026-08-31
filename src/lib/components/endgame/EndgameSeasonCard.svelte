<script lang="ts">
  import type { EndgameMode } from '$lib/domain/endgame';
  import {
    ENDGAME_MODE_META,
    type EndgamePeriodStatus,
    type EndgamePeriodView
  } from '$lib/domain/endgame-view';
  import EndgameModeIcon from './EndgameModeIcon.svelte';

  export let mode: EndgameMode;
  export let period: EndgamePeriodView;
  export let variant: EndgamePeriodStatus;

  $: metadata = ENDGAME_MODE_META[mode];
  $: dateLabel = period.status === 'unknown' ? '-' : period.dateLabel;
</script>

<a
  class={`endgame-season-card endgame-season-card--${variant}`}
  href={`/endgame/${mode}/${period.groupId}`}
  aria-label={`${period.name}，查看赛期详情`}
  style={`--endgame-accent: ${metadata.accent};`}
  data-endgame-season-card={variant}
>
  {#if variant === 'current'}
    <span class="endgame-season-card__watermark" aria-hidden="true">
      <EndgameModeIcon {mode} />
    </span>
  {/if}

  <div class="endgame-season-card__content">
    <h3>{period.name}</h3>
    <span class="endgame-season-card__date">{dateLabel}</span>
  </div>

  <span class="endgame-season-card__footer">
    <span>{period.encounterCount} 个关卡</span>
    <span class="endgame-season-card__arrow" aria-hidden="true">→</span>
  </span>
</a>

<style>
  .endgame-season-card {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 124px;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-card);
    background: linear-gradient(155deg, rgb(255 255 255 / 3%), transparent 48%), var(--surface);
    padding: var(--space-4);
    isolation: isolate;
    transition:
      border-color var(--motion),
      background var(--motion),
      box-shadow var(--motion);
  }

  .endgame-season-card--current {
    min-height: 210px;
    border-color: color-mix(in srgb, var(--endgame-accent) 28%, var(--border));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--endgame-accent) 7%, transparent),
        transparent 54%
      ),
      linear-gradient(155deg, rgb(255 255 255 / 4%), transparent 48%), var(--surface);
    padding: var(--space-6);
  }

  .endgame-season-card--upcoming {
    min-height: 156px;
    border-color: color-mix(in srgb, var(--endgame-accent) 17%, var(--border));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--endgame-accent) 3%, transparent),
        transparent 55%
      ),
      linear-gradient(155deg, rgb(255 255 255 / 3%), transparent 48%), var(--surface);
    padding: var(--space-4) var(--space-6);
  }

  .endgame-season-card:hover {
    border-color: color-mix(in srgb, var(--endgame-accent) 34%, var(--border));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--endgame-accent) 5%, transparent),
        transparent 55%
      ),
      linear-gradient(155deg, rgb(255 255 255 / 4%), transparent 48%), var(--surface);
  }

  .endgame-season-card--current:hover {
    border-color: color-mix(in srgb, var(--endgame-accent) 52%, var(--border));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--endgame-accent) 10%, transparent),
        transparent 58%
      ),
      linear-gradient(155deg, rgb(255 255 255 / 5%), transparent 48%), var(--surface);
    box-shadow: 0 14px 34px rgb(0 0 0 / 20%);
  }

  .endgame-season-card:focus-visible {
    outline-color: var(--endgame-accent);
  }

  .endgame-season-card__watermark {
    position: absolute;
    z-index: -1;
    right: -2.5rem;
    bottom: -5rem;
    display: grid;
    font-size: 18rem;
    opacity: 0.065;
    pointer-events: none;
    transform: rotate(-7deg);
    mask-image: linear-gradient(90deg, transparent 0%, black 42%);
    transition: opacity var(--motion);
  }

  .endgame-season-card--current:hover .endgame-season-card__watermark {
    opacity: 0.09;
  }

  .endgame-season-card__content {
    position: relative;
    z-index: 1;
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
  }

  .endgame-season-card h3 {
    max-width: min(100%, 38rem);
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--text-primary);
    font-size: var(--font-major-title);
    line-height: 1.3;
  }

  .endgame-season-card--current h3 {
    font-size: clamp(1.55rem, 3vw, 2.15rem);
  }

  .endgame-season-card--upcoming h3 {
    font-size: var(--font-card-category);
  }

  .endgame-season-card__date {
    margin-top: var(--space-2);
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-variant-numeric: tabular-nums;
    line-height: 1.5;
  }

  .endgame-season-card--current .endgame-season-card__date,
  .endgame-season-card--upcoming .endgame-season-card__date {
    font-size: var(--font-meta-value);
  }

  .endgame-season-card__footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border-top: 1px solid var(--border);
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-weight: 700;
  }

  .endgame-season-card--current .endgame-season-card__footer,
  .endgame-season-card--upcoming .endgame-season-card__footer {
    color: var(--endgame-accent);
    font-size: var(--font-meta-value);
  }

  .endgame-season-card__arrow {
    flex: 0 0 auto;
    color: var(--endgame-accent);
    font-size: 1.2rem;
    transition: transform var(--motion);
  }

  .endgame-season-card:hover .endgame-season-card__arrow {
    transform: translateX(3px);
  }

  @media (max-width: 520px) {
    .endgame-season-card--current {
      min-height: 190px;
      padding: var(--space-5);
    }

    .endgame-season-card--upcoming {
      min-height: 156px;
      padding: var(--space-4);
    }

    .endgame-season-card__watermark {
      right: -4rem;
      bottom: -3rem;
      font-size: 13rem;
    }
  }
</style>
