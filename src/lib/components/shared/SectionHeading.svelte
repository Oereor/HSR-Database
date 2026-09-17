<script lang="ts">
  export let level: 1 | 2 | 3 = 1;
  export let headingLevel: 2 | 3 | 4 | undefined = undefined;
  export let tone: 'primary' | 'muted' = 'primary';
  export let id: string | undefined = undefined;

  $: resolvedHeadingLevel = headingLevel ?? ((level + 1) as 2 | 3 | 4);
  $: headingTag = `h${resolvedHeadingLevel}` as const;
</script>

<div
  class:section-heading--level-1={level === 1}
  class:section-heading--level-2={level === 2}
  class:section-heading--level-3={level === 3}
  class:section-heading--muted={tone === 'muted'}
  class:section-heading--with-meta={$$slots.meta}
  class="section-heading-shared"
>
  <svelte:element this={headingTag} {id}><slot /></svelte:element>
  <span class="section-heading-shared__divider" aria-hidden="true"></span>
  {#if $$slots.meta}
    <span class="section-heading-shared__meta"><slot name="meta" /></span>
  {/if}
</div>

<style>
  .section-heading-shared {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
  }

  .section-heading-shared h2,
  .section-heading-shared h3,
  .section-heading-shared h4 {
    min-width: 0;
    flex: 0 1 auto;
    margin: 0;
    color: var(--text-primary);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .section-heading-shared__divider {
    height: 1px;
    min-width: var(--space-6);
    flex: 1 1 auto;
  }

  .section-heading-shared__meta {
    min-width: 0;
    flex: 0 1 auto;
    color: var(--text-secondary);
    font-size: var(--font-helper);
    line-height: 1.5;
  }

  .section-heading--level-1 {
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }

  .section-heading--level-1 h2,
  .section-heading--level-1 h3,
  .section-heading--level-1 h4 {
    font-size: var(--font-section-title);
    font-weight: 750;
    letter-spacing: -0.02em;
  }

  .section-heading--level-1 .section-heading-shared__divider {
    background: color-mix(in srgb, var(--border) 72%, transparent);
  }

  .section-heading--level-2 {
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .section-heading--level-2 h2,
  .section-heading--level-2 h3,
  .section-heading--level-2 h4 {
    font-size: var(--font-major-title);
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  .section-heading--level-2 .section-heading-shared__divider {
    background: color-mix(in srgb, var(--border) 56%, transparent);
  }

  .section-heading--level-3 {
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .section-heading--level-3 h2,
  .section-heading--level-3 h3,
  .section-heading--level-3 h4 {
    color: var(--text-secondary);
    font-size: var(--font-meta-key);
    font-weight: 650;
    letter-spacing: 0.025em;
  }

  .section-heading--level-3 .section-heading-shared__divider {
    background: color-mix(in srgb, var(--border) 36%, transparent);
  }

  .section-heading--muted h2,
  .section-heading--muted h3,
  .section-heading--muted h4 {
    color: var(--text-secondary);
  }

  @media (max-width: 520px) {
    .section-heading--with-meta {
      flex-wrap: wrap;
    }

    .section-heading--with-meta .section-heading-shared__meta {
      flex-basis: 100%;
    }
  }
</style>
