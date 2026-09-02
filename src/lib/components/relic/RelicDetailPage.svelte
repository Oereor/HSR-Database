<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import RelicIcon from '$lib/components/relic/RelicIcon.svelte';
  import { getRelicPieceIconUrl, getRelicSetIconUrl } from '$lib/data/visual-assets';
  import { relicTypeNames } from '$lib/domain/constants';
  import type { RelicSet } from '$lib/domain/types';

  export let detail: RelicSet;
  export let singular: string;
</script>

<header class="detail-profile-hero detail-profile-hero--relic" data-relic-detail-hero>
  <div class="detail-profile-hero__identity">
    <RelicIcon
      source={getRelicSetIconUrl(detail.id)}
      alt={`${detail.name}套装预览`}
      fallbackLabel={detail.name}
      presentation="hero"
    />
    <div
      class="detail-profile-hero__gradient detail-profile-hero__gradient--relic"
      aria-hidden="true"
    ></div>
    <div class="hero-identity-copy">
      <p class="kicker">{singular} / ID {detail.id}</p>
      <h1><GameText text={detail.name} /></h1>
      <div class="relic-identity-tags" aria-label="套装分类与版本">
        <span>{detail.typeName}</span>
        {#if detail.version}<span>版本 {detail.version}</span>{/if}
      </div>
    </div>
  </div>
  <aside
    class="detail-profile-hero__inspection relic-effects-panel"
    aria-labelledby="relic-effects"
  >
    <SectionHeading level={1} id="relic-effects">套装效果</SectionHeading>
    {#if detail.effects.length}
      <div class="relic-effect-list" data-effect-count={detail.effects.length}>
        {#each detail.effects as effect (effect.required)}
          <article class="relic-effect" data-effect-requirement={effect.required}>
            <strong><span>{effect.required}</span> 件套</strong>
            <p><GameText text={effect.description || '上游未提供可解析的套装描述。'} /></p>
          </article>
        {/each}
      </div>
    {:else}
      <p class="data-placeholder">上游未提供可解析的套装效果。</p>
    {/if}
  </aside>
</header>

<section class="detail-section relic-piece-section" data-relic-piece-count={detail.pieces.length}>
  <SectionHeading level={1}>套装部件</SectionHeading>
  {#if detail.pieces.length}
    <div class="relic-piece-grid">
      {#each detail.pieces as piece (piece.id)}
        <article
          class="relic-piece-card"
          data-relic-piece-id={piece.id}
          data-relic-slot={piece.slot}
        >
          <RelicIcon
            source={getRelicPieceIconUrl(piece.id)}
            alt={piece.name}
            fallbackLabel={piece.name}
          />
          <div class="relic-piece-card__content">
            <span class="relic-piece-card__slot">
              {relicTypeNames[piece.slot] || '部件类型未提供'}
            </span>
            <h3><GameText text={piece.name} /></h3>
            <p class:muted={!piece.description}>
              <GameText text={piece.description || '上游未提供该部件的文字说明。'} />
            </p>
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <p class="data-placeholder">上游未提供套装部件记录。</p>
  {/if}
</section>

<style>
  .relic-identity-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .relic-identity-tags span,
  .relic-piece-card__slot {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgb(7 10 18 / 68%);
    color: var(--gold-soft);
    font-size: var(--font-helper);
    line-height: 1.2;
  }

  .relic-identity-tags span {
    padding: 0.42rem 0.68rem;
  }

  .relic-effects-panel {
    display: grid;
    min-height: 100%;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .relic-effect-list {
    display: grid;
    min-width: 0;
    align-content: center;
  }

  .relic-effect {
    min-width: 0;
    padding: clamp(1.5rem, 3vw, 2.25rem) 0;
  }

  .relic-effect + .relic-effect {
    border-top: 1px solid var(--border);
  }

  .relic-effect strong {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    color: var(--gold-soft);
    font-size: var(--font-meta-value);
    font-weight: 650;
  }

  .relic-effect strong span {
    color: var(--gold);
    font-family: var(--font-display);
    font-size: 1.8rem;
    font-weight: 700;
    line-height: 1;
  }

  .relic-effect p {
    max-width: 40rem;
    margin: var(--space-4) 0 0;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.85;
    overflow-wrap: anywhere;
  }

  .relic-piece-grid {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    align-items: stretch;
    gap: var(--space-4);
  }

  .relic-piece-card {
    position: relative;
    display: flex;
    min-width: 0;
    height: 100%;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: linear-gradient(155deg, rgb(255 255 255 / 4%), transparent 46%), var(--surface);
  }

  .relic-piece-card__content {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-4);
  }

  .relic-piece-card__slot {
    position: absolute;
    z-index: 1;
    top: var(--space-4);
    right: var(--space-4);
    padding: 0.3rem 0.58rem;
  }

  .relic-piece-card h3 {
    margin: var(--space-3) 0 0;
    color: var(--text-primary);
    font-size: var(--font-major-title);
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .relic-piece-card p {
    margin: var(--space-3) 0 0;
    color: var(--text-secondary);
    font-size: var(--font-body);
    line-height: 1.72;
    overflow-wrap: anywhere;
  }

  @media (max-width: 820px) {
    .relic-effect-list {
      align-content: start;
    }
  }

  @media (max-width: 520px) {
    .relic-piece-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
