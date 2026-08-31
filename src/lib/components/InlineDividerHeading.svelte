<script lang="ts">
  export let level: 2 | 3 | 4 = 2;
  export let scale: 'large' | 'medium' | 'small' = 'medium';
  export let tone: 'primary' | 'muted' = 'primary';
  export let id: string | undefined = undefined;

  $: headingTag = `h${level}` as const;
</script>

<div
  class:inline-divider-heading--large={scale === 'large'}
  class:inline-divider-heading--medium={scale === 'medium'}
  class:inline-divider-heading--small={scale === 'small'}
  class:inline-divider-heading--muted={tone === 'muted'}
  class="inline-divider-heading"
>
  <svelte:element this={headingTag} {id}><slot /></svelte:element>
  <span aria-hidden="true"></span>
</div>

<style>
  .inline-divider-heading {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
  }

  .inline-divider-heading h2,
  .inline-divider-heading h3,
  .inline-divider-heading h4 {
    flex: 0 1 auto;
    margin: 0;
    color: var(--text-primary);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .inline-divider-heading > span {
    height: 1px;
    min-width: var(--space-6);
    flex: 1 1 auto;
  }

  .inline-divider-heading--large {
    gap: var(--space-4);
  }

  .inline-divider-heading--large h2,
  .inline-divider-heading--large h3,
  .inline-divider-heading--large h4 {
    font-size: var(--font-section-title);
    font-weight: 750;
    letter-spacing: -0.02em;
  }

  .inline-divider-heading--large > span {
    background: color-mix(in srgb, var(--border) 72%, transparent);
  }

  .inline-divider-heading--medium {
    gap: var(--space-3);
  }

  .inline-divider-heading--medium h2,
  .inline-divider-heading--medium h3,
  .inline-divider-heading--medium h4 {
    font-size: var(--font-major-title);
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  .inline-divider-heading--medium > span {
    background: color-mix(in srgb, var(--border) 56%, transparent);
  }

  .inline-divider-heading--small {
    gap: var(--space-3);
  }

  .inline-divider-heading--small h2,
  .inline-divider-heading--small h3,
  .inline-divider-heading--small h4 {
    color: var(--text-secondary);
    font-size: var(--font-meta-key);
    font-weight: 650;
    letter-spacing: 0.025em;
  }

  .inline-divider-heading--small > span {
    background: color-mix(in srgb, var(--border) 36%, transparent);
  }

  .inline-divider-heading--muted h2,
  .inline-divider-heading--muted h3,
  .inline-divider-heading--muted h4 {
    color: var(--text-secondary);
  }
</style>
