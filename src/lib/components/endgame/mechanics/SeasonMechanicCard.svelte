<script lang="ts" context="module">
  export type SeasonMechanicCardContent =
    | { kind: 'description'; description: string }
    | {
        kind: 'segments';
        items: Array<{ key: string | number; title: string; description: string }>;
      };
</script>

<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';

  export let title: string;
  export let content: SeasonMechanicCardContent;
  export let headingLevel: 2 | 3 | 4 = 2;

  $: headingTag = `h${headingLevel}` as const;
  $: itemHeadingTag = `h${Math.min(headingLevel + 1, 5)}` as const;
</script>

<article class="season-mechanic-card">
  <svelte:element this={headingTag} class="season-mechanic-card__title">
    <GameText text={title} />
  </svelte:element>
  {#if content.kind === 'description'}
    <p><GameText text={content.description} /></p>
  {:else}
    <div
      class:season-mechanic-card__segments--two={content.items.length === 2}
      class:season-mechanic-card__segments--three={content.items.length >= 3}
      class="season-mechanic-card__segments"
      data-season-mechanic-segments={content.items.length}
    >
      {#each content.items as item (item.key)}
        <article class="season-mechanic-card__segment">
          <svelte:element this={itemHeadingTag}><GameText text={item.title} /></svelte:element>
          <p><GameText text={item.description} /></p>
        </article>
      {/each}
    </div>
  {/if}
</article>

<style>
  .season-mechanic-card {
    min-width: 0;
    container-type: inline-size;
    border-left: 2px solid rgb(215 181 109 / 72%);
    background: linear-gradient(105deg, rgb(215 181 109 / 9%), rgb(14 20 34 / 54%) 48%);
    padding: var(--space-4) var(--space-6);
  }

  .season-mechanic-card__title {
    margin: 0 0 var(--space-3);
    color: var(--gold-soft);
    font-size: var(--font-major-title);
    font-weight: 700;
    line-height: 1.35;
  }

  .season-mechanic-card > p,
  .season-mechanic-card__segment p {
    margin: 0;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.7;
  }

  .season-mechanic-card__segments {
    display: grid;
    min-width: 0;
  }

  .season-mechanic-card__segment {
    min-width: 0;
  }

  .season-mechanic-card__segment + .season-mechanic-card__segment {
    margin-top: var(--space-4);
    border-top: 1px solid var(--surface-border);
    padding-top: var(--space-4);
  }

  .season-mechanic-card__segment h3,
  .season-mechanic-card__segment h4,
  .season-mechanic-card__segment h5 {
    margin: 0 0 var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-meta-value);
    font-weight: 650;
    line-height: 1.4;
  }

  @container (min-width: 600px) {
    .season-mechanic-card__segments--two,
    .season-mechanic-card__segments--three {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .season-mechanic-card__segment,
    .season-mechanic-card__segment + .season-mechanic-card__segment {
      margin-top: 0;
      border-top: 0;
      padding: 0 var(--space-4);
    }

    .season-mechanic-card__segment:first-child {
      padding-left: 0;
    }

    .season-mechanic-card__segment:nth-child(even) {
      border-left: 1px solid var(--surface-border);
      padding-right: 0;
    }

    .season-mechanic-card__segments--three .season-mechanic-card__segment:last-child {
      grid-column: 1 / -1;
      margin-top: var(--space-4);
      border-top: 1px solid var(--surface-border);
      padding: var(--space-4) 0 0;
    }
  }

  @container (min-width: 840px) {
    .season-mechanic-card__segments--three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .season-mechanic-card__segments--three .season-mechanic-card__segment,
    .season-mechanic-card__segments--three .season-mechanic-card__segment:nth-child(even),
    .season-mechanic-card__segments--three .season-mechanic-card__segment:last-child {
      grid-column: auto;
      margin-top: 0;
      border-top: 0;
      border-left: 0;
      padding: 0 var(--space-4);
    }

    .season-mechanic-card__segments--three .season-mechanic-card__segment:first-child {
      padding-left: 0;
    }

    .season-mechanic-card__segments--three
      .season-mechanic-card__segment
      + .season-mechanic-card__segment {
      border-left: 1px solid var(--surface-border);
    }

    .season-mechanic-card__segments--three .season-mechanic-card__segment:last-child {
      padding-right: 0;
    }
  }

  @media (max-width: 520px) {
    .season-mechanic-card {
      padding: var(--space-4);
    }
  }
</style>
