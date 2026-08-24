<script lang="ts">
  export let href: string | undefined = undefined;
  export let imageUrl: string | undefined = undefined;
  export let imageAlt = '';
  export let fallbackLabel: string;
  export let artworkFit: 'contain' | 'cover' | 'scale-down' = 'contain';

  let failedSource: string | undefined;
  $: visibleSource = imageUrl && imageUrl !== failedSource ? imageUrl : undefined;
  $: fallbackMark = fallbackLabel.trim().slice(0, 1) || '轨';
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
