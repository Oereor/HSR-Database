<script lang="ts">
  import RogueTierTag from './RogueTierTag.svelte';
  import type { RoguePresentationTier } from '$lib/domain/rogue';

  export let id: string;
  export let kind: string;
  export let tier: RoguePresentationTier;
</script>

<article
  class="rogue-card"
  data-rogue-card={id}
  data-rogue-card-kind={kind}
  style={`--rogue-accent:${tier.color}`}
>
  <div class="rogue-card__path"><slot name="path" /></div>
  <div class="rogue-card__content">
    <header class="rogue-card__heading">
      <h3><slot name="title" /></h3>
      {#if $$slots.secondary}<div class="rogue-card__secondary"><slot name="secondary" /></div>{/if}
    </header>
    <div class="rogue-card__body"><slot /></div>
  </div>
  <div class="rogue-card__tier"><RogueTierTag {tier} /></div>
</article>

<style>
  .rogue-card {
    position: relative;
    display: grid;
    min-width: 0;
    grid-template-columns: 9.25rem minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--rogue-accent) 38%, var(--surface-border));
    border-radius: var(--radius-card);
    background:
      linear-gradient(
        108deg,
        color-mix(in srgb, var(--rogue-accent) 13%, transparent) 0%,
        color-mix(in srgb, var(--rogue-accent) 5%, transparent) 38%,
        transparent 72%
      ),
      linear-gradient(145deg, rgb(18 25 40 / 92%), rgb(10 15 27 / 94%));
    box-shadow:
      inset 0 1px rgb(255 255 255 / 3%),
      0 10px 28px rgb(0 0 0 / 10%);
  }
  .rogue-card::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: color-mix(in srgb, var(--rogue-accent) 88%, transparent);
    content: '';
  }
  .rogue-card__path {
    display: grid;
    min-width: 0;
    min-height: 10.25rem;
    place-items: center;
    padding: 1.15rem 0.9rem;
    background: radial-gradient(
      circle at 48% 46%,
      color-mix(in srgb, var(--rogue-accent) 11%, transparent),
      transparent 70%
    );
  }
  .rogue-card__content {
    min-width: 0;
    padding: 1.5rem 1.75rem 1.55rem;
  }
  .rogue-card__heading {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-5);
    padding-right: 6rem;
  }
  h3 {
    min-width: 0;
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(1.05rem, 1.45vw, 1.24rem);
    font-weight: 720;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .rogue-card__secondary {
    min-width: 0;
    flex: 0 1 auto;
  }
  .rogue-card__body {
    min-width: 0;
    max-width: 76ch;
    margin-top: 0.85rem;
  }
  :global(.rogue-card__body [data-rogue-extra-effects]) {
    margin-top: var(--space-4);
  }
  .rogue-card__tier {
    position: absolute;
    top: 1.15rem;
    right: 1.35rem;
  }
  @media (max-width: 640px) {
    .rogue-card {
      grid-template-columns: 6rem minmax(0, 1fr);
    }
    .rogue-card__path {
      min-height: 8.5rem;
      padding: 0.75rem 0.45rem;
    }
    .rogue-card__content {
      padding: 3.45rem var(--space-4) 1.2rem;
    }
    .rogue-card__heading {
      align-items: stretch;
      flex-direction: column;
      gap: var(--space-2);
      padding-right: 0;
    }
    .rogue-card__secondary {
      align-self: flex-start;
    }
    .rogue-card__tier {
      top: 0.9rem;
      right: 0.95rem;
    }
  }
  @media (max-width: 420px) {
    .rogue-card {
      grid-template-columns: 5.35rem minmax(0, 1fr);
    }
    .rogue-card__path {
      padding-inline: 0.4rem;
    }
    .rogue-card__content {
      padding-inline: 0.85rem;
    }
  }
</style>
