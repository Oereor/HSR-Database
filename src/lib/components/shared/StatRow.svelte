<script lang="ts">
  import AssetImage from './AssetImage.svelte';

  export let label: string;
  export let value: string | number;
  export let iconUrl: string | undefined = undefined;
  export let tone: 'default' | 'scaling' | 'unavailable' = 'default';
</script>

<div {...$$restProps} class="inspection-stat-row hero-stat-row">
  <dt>
    <span class="inspection-stat-label">
      {#if iconUrl}
        <span class="hero-stat-icon" aria-hidden="true">
          <AssetImage decorative src={iconUrl} alt="" />
        </span>
      {/if}
      <span class="hero-stat-label-text">{label}</span>
    </span>
  </dt>
  <dd>
    <strong
      class:scaling-value={tone === 'scaling'}
      class:stat-value--unavailable={tone === 'unavailable'}>{value}</strong
    >
  </dd>
</div>

<style>
  .hero-stat-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) fit-content(50%);
    min-height: 52px;
    align-items: center;
    gap: var(--space-4);
    border: 0;
    padding: var(--space-3) 0;
  }

  :global(.hero-stat-row) + .hero-stat-row::before {
    position: absolute;
    inset: 0 0 auto var(--stat-divider-inset, 0px);
    height: 1px;
    background: color-mix(in srgb, var(--border) 50%, transparent);
    content: '';
  }

  :global(.hero-stat-row) + .hero-stat-row {
    border-top: 0;
  }

  .hero-stat-row dt,
  .hero-stat-row dd {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .hero-stat-row dt {
    color: var(--text-secondary);
    font-size: var(--font-meta-key);
  }

  .hero-stat-row dd {
    margin: 0;
    text-align: right;
  }

  .hero-stat-row dd strong {
    color: var(--text-primary);
    font-size: 1.08rem;
    font-variant-numeric: tabular-nums;
  }

  .hero-stat-row dd .scaling-value {
    color: var(--skill-scaling-value-color);
  }

  .hero-stat-row .inspection-stat-label {
    display: grid;
    grid-template-columns: var(--stat-label-columns, minmax(0, 1fr));
    align-items: center;
    gap: var(--stat-label-gap, 0px);
  }

  .hero-stat-label-text {
    grid-column: -2 / -1;
    min-width: 0;
  }

  .hero-stat-icon {
    display: flex;
    width: 20px;
    align-items: center;
    justify-content: center;
  }

  .hero-stat-icon :global(img) {
    width: 1.05rem;
    height: 1.05rem;
    flex: 0 0 auto;
    object-fit: contain;
  }

  .hero-stat-row dd .stat-value--unavailable {
    color: var(--text-muted);
    font-weight: 400;
  }

  @media (max-width: 820px) {
    .hero-stat-row {
      padding-block: 10px;
    }
  }
</style>
