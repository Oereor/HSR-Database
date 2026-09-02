<script lang="ts">
  import type { EndgameModeView } from '$lib/domain/endgame-view';
  import { ENDGAME_MODE_META } from '$lib/domain/endgame-view';
  import EndgameModeIcon from './EndgameModeIcon.svelte';

  export let mode: EndgameModeView;
  export let featured = false;

  $: metadata = ENDGAME_MODE_META[mode.mode];
  $: period = mode.periods.find((candidate) => candidate.groupId === mode.recommendedGroupId);
  $: dateLabel = period?.dateLabel ?? '-';
  $: href = period ? `/endgame/${mode.mode}/${period.groupId}` : `/endgame/${mode.mode}`;
</script>

<a
  class="endgame-overview-card"
  class:endgame-overview-card--featured={featured}
  {href}
  style={`--endgame-accent: ${metadata.accent};`}
  data-endgame-overview-card={mode.mode}
>
  <span class="endgame-overview-card__watermark" aria-hidden="true">
    <EndgameModeIcon mode={mode.mode} />
  </span>

  <span class="endgame-overview-card__heading">
    <span class="endgame-overview-card__icon"><EndgameModeIcon mode={mode.mode} /></span>
    <span>{metadata.label}</span>
  </span>

  <span class="endgame-overview-card__season">
    <span class="endgame-overview-card__label">当前赛期</span>
    <strong>{period?.name ?? '暂无赛期'}</strong>
    <span class="endgame-overview-card__date">{dateLabel}</span>
  </span>

  <span class="endgame-overview-card__footer">
    <span>{mode.periods.length} 个赛期</span>
    <span class="endgame-overview-card__arrow" aria-hidden="true">→</span>
  </span>
</a>

<style>
  .endgame-overview-card {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 282px;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--endgame-accent) 18%, var(--border));
    border-radius: var(--radius-card);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--endgame-accent) 5%, transparent),
        transparent 48%
      ),
      linear-gradient(155deg, rgb(255 255 255 / 4%), transparent 46%), var(--surface);
    padding: var(--space-6);
    isolation: isolate;
    transition:
      transform var(--motion),
      border-color var(--motion),
      box-shadow var(--motion),
      background var(--motion);
  }

  .endgame-overview-card--featured {
    min-height: 220px;
  }

  .endgame-overview-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--endgame-accent) 48%, var(--border));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--endgame-accent) 9%, transparent),
        transparent 55%
      ),
      linear-gradient(155deg, rgb(255 255 255 / 5%), transparent 46%), var(--surface);
    box-shadow: 0 14px 34px rgb(0 0 0 / 24%);
  }

  .endgame-overview-card:focus-visible {
    outline-color: var(--endgame-accent);
  }

  .endgame-overview-card__watermark {
    position: absolute;
    z-index: -1;
    right: -3.5rem;
    bottom: -4.5rem;
    display: grid;
    font-size: 15rem;
    opacity: 0.07;
    pointer-events: none;
    transform: rotate(-7deg);
    transition: opacity var(--motion);
    mask-image: linear-gradient(90deg, transparent 0%, black 38%);
  }

  .endgame-overview-card--featured .endgame-overview-card__watermark {
    right: 2%;
    bottom: -6rem;
    font-size: 19rem;
  }

  .endgame-overview-card:hover .endgame-overview-card__watermark {
    opacity: 0.1;
  }

  .endgame-overview-card__heading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--text-primary);
    font-size: var(--font-card-category);
    font-weight: 750;
    line-height: 1.2;
  }

  .endgame-overview-card__icon {
    display: grid;
    place-items: center;
    font-size: 2.75rem;
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--endgame-accent) 32%, transparent));
    transition: filter var(--motion);
  }

  .endgame-overview-card:hover .endgame-overview-card__icon {
    filter: drop-shadow(0 0 13px color-mix(in srgb, var(--endgame-accent) 52%, transparent));
  }

  .endgame-overview-card__season {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: center;
    padding: var(--space-6) 0;
  }

  .endgame-overview-card--featured .endgame-overview-card__season {
    padding-block: var(--space-4);
  }

  .endgame-overview-card__label {
    margin-bottom: var(--space-2);
    color: var(--endgame-accent);
    font-size: var(--font-helper);
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .endgame-overview-card__season strong {
    max-width: min(100%, 24rem);
    overflow: hidden;
    color: var(--text-primary);
    font-size: clamp(1.35rem, 2.2vw, 1.75rem);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .endgame-overview-card__date {
    margin-top: var(--space-2);
    color: var(--text-secondary);
    font-size: var(--font-meta-value);
    font-variant-numeric: tabular-nums;
  }

  .endgame-overview-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
    color: var(--endgame-accent);
    font-size: var(--font-meta-value);
    font-weight: 700;
  }

  .endgame-overview-card__arrow {
    font-size: 1.35rem;
    transition: transform var(--motion);
  }

  .endgame-overview-card:hover .endgame-overview-card__arrow {
    transform: translateX(3px);
  }

  @media (max-width: 520px) {
    .endgame-overview-card,
    .endgame-overview-card--featured {
      min-height: 250px;
      padding: var(--space-4);
    }

    .endgame-overview-card__season,
    .endgame-overview-card--featured .endgame-overview-card__season {
      padding-block: var(--space-6);
    }

    .endgame-overview-card__watermark,
    .endgame-overview-card--featured .endgame-overview-card__watermark {
      right: -3rem;
      bottom: -3rem;
      font-size: 13rem;
    }
  }
</style>
