<script lang="ts" context="module">
  export type MechanicSectionContent =
    | { kind: 'description'; description: string }
    | {
        kind: 'segments';
        items: Array<{ key: string | number; title: string; description: string }>;
      };

  export type MechanicSectionTone = 'buff' | 'debuff';
</script>

<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';

  export let title: string;
  export let content: MechanicSectionContent;
  export let headingLevel: 2 | 3 | 4 = 2;
  export let tone: MechanicSectionTone = 'buff';

  $: headingTag = `h${headingLevel}` as const;
  $: itemHeadingTag = `h${Math.min(headingLevel + 1, 5)}` as const;
</script>

<article
  class:mechanic-section-card--debuff={tone === 'debuff'}
  class="mechanic-section-card season-mechanic-card"
  data-mechanic-tone={tone}
>
  <svelte:element
    this={headingTag}
    class="mechanic-section-card__title season-mechanic-card__title"
  >
    <GameText text={title} />
  </svelte:element>
  {#if content.kind === 'description'}
    <p><GameText text={content.description} /></p>
  {:else}
    <div
      class:mechanic-section-card__segments--two={content.items.length === 2}
      class:mechanic-section-card__segments--three={content.items.length >= 3}
      class:season-mechanic-card__segments--two={content.items.length === 2}
      class:season-mechanic-card__segments--three={content.items.length >= 3}
      class="mechanic-section-card__segments season-mechanic-card__segments"
      data-mechanic-section-segments={content.items.length}
      data-season-mechanic-segments={content.items.length}
    >
      {#each content.items as item (item.key)}
        <article class="mechanic-section-card__segment season-mechanic-card__segment">
          <svelte:element this={itemHeadingTag}><GameText text={item.title} /></svelte:element>
          <p><GameText text={item.description} /></p>
        </article>
      {/each}
    </div>
  {/if}
</article>

<style>
  .mechanic-section-card {
    --mechanic-accent: #d7b56d;
    --mechanic-title-color: var(--gold-soft);

    min-width: 0;
    container-type: inline-size;
    border-left: 2px solid color-mix(in srgb, var(--mechanic-accent) 72%, transparent);
    background: linear-gradient(
      105deg,
      color-mix(in srgb, var(--mechanic-accent) 9%, transparent),
      rgb(14 20 34 / 54%) 48%
    );
    padding: var(--space-4) var(--space-6);
  }

  .mechanic-section-card--debuff {
    --mechanic-accent: #fb4554;
    --mechanic-title-color: color-mix(in srgb, var(--mechanic-accent) 78%, var(--text-primary));
  }

  .mechanic-section-card__title {
    margin: 0 0 var(--space-3);
    color: var(--mechanic-title-color);
    font-size: var(--font-major-title);
    font-weight: 700;
    line-height: 1.35;
  }

  .mechanic-section-card > p,
  .mechanic-section-card__segment p {
    margin: 0;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.7;
  }

  .mechanic-section-card__segments {
    display: grid;
    min-width: 0;
  }

  .mechanic-section-card__segment {
    min-width: 0;
  }

  .mechanic-section-card__segment + .mechanic-section-card__segment {
    margin-top: var(--space-4);
    border-top: 1px solid var(--surface-border);
    padding-top: var(--space-4);
  }

  .mechanic-section-card__segment h3,
  .mechanic-section-card__segment h4,
  .mechanic-section-card__segment h5 {
    margin: 0 0 var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-meta-value);
    font-weight: 650;
    line-height: 1.4;
  }

  .mechanic-section-card--debuff :global([data-game-color]) {
    color: color-mix(in srgb, var(--mechanic-accent) 84%, var(--text-primary)) !important;
  }

  @container (min-width: 600px) {
    .mechanic-section-card__segments--two,
    .mechanic-section-card__segments--three {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mechanic-section-card__segment,
    .mechanic-section-card__segment + .mechanic-section-card__segment {
      margin-top: 0;
      border-top: 0;
      padding: 0 var(--space-4);
    }

    .mechanic-section-card__segment:first-child {
      padding-left: 0;
    }

    .mechanic-section-card__segment:nth-child(even) {
      border-left: 1px solid var(--surface-border);
      padding-right: 0;
    }

    .mechanic-section-card__segments--three .mechanic-section-card__segment:last-child {
      grid-column: 1 / -1;
      margin-top: var(--space-4);
      border-top: 1px solid var(--surface-border);
      padding: var(--space-4) 0 0;
    }
  }

  @container (min-width: 840px) {
    .mechanic-section-card__segments--three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .mechanic-section-card__segments--three .mechanic-section-card__segment,
    .mechanic-section-card__segments--three .mechanic-section-card__segment:nth-child(even),
    .mechanic-section-card__segments--three .mechanic-section-card__segment:last-child {
      grid-column: auto;
      margin-top: 0;
      border-top: 0;
      border-left: 0;
      padding: 0 var(--space-4);
    }

    .mechanic-section-card__segments--three .mechanic-section-card__segment:first-child {
      padding-left: 0;
    }

    .mechanic-section-card__segments--three
      .mechanic-section-card__segment
      + .mechanic-section-card__segment {
      border-left: 1px solid var(--surface-border);
    }

    .mechanic-section-card__segments--three .mechanic-section-card__segment:last-child {
      padding-right: 0;
    }
  }

  @media (max-width: 520px) {
    .mechanic-section-card {
      padding: var(--space-4);
    }
  }
</style>
