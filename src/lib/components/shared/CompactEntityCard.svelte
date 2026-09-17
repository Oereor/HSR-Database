<script lang="ts">
  export let href: string | undefined = undefined;
  export let imageUrl: string | undefined = undefined;
  export let imageAlt = '';
  export let fallbackLabel: string;
  export let artworkFit: 'contain' | 'cover' | 'scale-down' = 'contain';

  let failedSource: string | undefined;
  $: visibleSource = imageUrl && imageUrl !== failedSource ? imageUrl : undefined;
  $: fallbackMark = fallbackLabel.trim().slice(0, 1) || '?';
  $: elementProps = href ? { href } : {};
</script>

<svelte:element
  this={href ? 'a' : 'article'}
  {...elementProps}
  {...$$restProps}
  class:compact-entity-card--link={!!href}
  class:compact-entity-card--missing={!visibleSource}
  class="compact-entity-card"
  data-image-missing={!visibleSource}
>
  <span class="compact-entity-card__artwork" aria-hidden={!imageAlt}>
    {#if visibleSource}
      <img
        src={visibleSource}
        alt={imageAlt}
        style:object-fit={artworkFit}
        loading="lazy"
        decoding="async"
        on:error={() => (failedSource = visibleSource)}
      />
    {:else}
      <span class="compact-entity-card__fallback" aria-hidden="true">{fallbackMark}</span>
    {/if}
  </span>
  <span class="compact-entity-card__content">
    <strong class="compact-entity-card__title"><slot name="title" /></strong>
    <span class="compact-entity-card__secondary"><slot name="secondary" /></span>
    {#if $$slots.tertiary}<span class="compact-entity-card__tertiary"><slot name="tertiary" /></span
      >{/if}
  </span>
  {#if href}<span class="compact-entity-card__arrow" aria-hidden="true">→</span>{/if}
</svelte:element>

<style>
  .compact-entity-card {
    display: grid;
    width: 100%;
    min-width: 0;
    min-height: 5.4rem;
    height: 100%;
    grid-template-columns: 4.6rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: rgb(14 20 34 / 68%);
    padding: 0.45rem 0.85rem 0.45rem 0.45rem;
    color: inherit;
    transition:
      border-color var(--motion),
      background var(--motion),
      transform var(--motion);
  }

  .compact-entity-card--link:hover {
    border-color: var(--border-strong);
    background: rgb(20 28 46 / 78%);
    transform: translateY(-1px);
  }

  .compact-entity-card--link:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
  }

  .compact-entity-card__artwork {
    display: grid;
    width: 4.6rem;
    height: 4.6rem;
    place-items: center;
    overflow: hidden;
    border-radius: calc(var(--radius-control) - 2px);
    background: radial-gradient(circle, rgb(215 181 109 / 13%), transparent 70%);
  }

  .compact-entity-card__artwork img {
    width: 100%;
    height: 100%;
  }

  .compact-entity-card__fallback {
    color: var(--gold);
    font-size: 1.45rem;
    font-weight: 700;
  }

  .compact-entity-card__content {
    display: grid;
    min-width: 0;
    align-content: center;
    gap: 0.26rem;
  }

  .compact-entity-card__title {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--font-meta-value);
    line-height: 1.3;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .compact-entity-card__secondary,
  .compact-entity-card__tertiary {
    display: flex;
    min-width: 0;
    align-items: center;
    color: var(--faint);
    font-size: var(--font-internal);
    line-height: 1.3;
  }

  .compact-entity-card__tertiary {
    --semantic-icon-gap: 0.32rem;
    --semantic-icon-image-size: 1rem;

    color: var(--text-secondary);
  }

  .compact-entity-card__arrow {
    color: var(--gold);
    font-size: 1rem;
  }

  @media (max-width: 520px) {
    .compact-entity-card {
      grid-template-columns: 4rem minmax(0, 1fr) auto;
    }

    .compact-entity-card__artwork {
      width: 4rem;
      height: 4rem;
    }
  }
</style>
