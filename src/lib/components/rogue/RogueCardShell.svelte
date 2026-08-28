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
    grid-template-columns: 9rem minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--rogue-accent) 30%, var(--surface-border));
    border-radius: var(--radius-card);
    background:
      linear-gradient(
        100deg,
        color-mix(in srgb, var(--rogue-accent) 9%, transparent),
        transparent 35%
      ),
      rgb(14 20 34 / 78%);
  }
  .rogue-card::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--rogue-accent);
    content: '';
  }
  .rogue-card__path {
    display: grid;
    min-width: 0;
    min-height: 9.5rem;
    place-items: center;
    border-right: 1px solid var(--surface-border);
    padding: var(--space-4);
  }
  .rogue-card__content {
    min-width: 0;
    padding: 1.35rem 1.5rem 1.4rem;
  }
  .rogue-card__heading {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding-right: 5.3rem;
  }
  h3 {
    min-width: 0;
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-major-title);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .rogue-card__secondary {
    min-width: 0;
    flex: 0 1 auto;
  }
  .rogue-card__body {
    min-width: 0;
    margin-top: var(--space-3);
  }
  .rogue-card__tier {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
  }
  @media (max-width: 640px) {
    .rogue-card {
      grid-template-columns: 6.2rem minmax(0, 1fr);
    }
    .rogue-card__path {
      min-height: 8rem;
      padding: 0.7rem;
    }
    .rogue-card__content {
      padding: 3.25rem var(--space-4) var(--space-4);
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
  }
  @media (max-width: 420px) {
    .rogue-card {
      grid-template-columns: 5.3rem minmax(0, 1fr);
    }
    .rogue-card__path {
      padding-inline: 0.4rem;
    }
    .rogue-card__content {
      padding-inline: 0.85rem;
    }
  }
</style>
