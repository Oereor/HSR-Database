<script lang="ts">
  export let href: string;
  export let imageUrl: string | undefined = undefined;
  export let imageAlt = '';
  export let fallbackLabel: string;
  export let artworkFit: 'contain' | 'cover' | 'scale-down' = 'contain';
  export let artworkPosition = 'center bottom';
  export let artworkScale = 1;

  let failedSource: string | undefined;
  $: visibleSource = imageUrl && imageUrl !== failedSource ? imageUrl : undefined;
  $: fallbackMark = fallbackLabel.trim().slice(0, 1) || '轨';
</script>

<a
  class="entity-overview-card"
  class:entity-overview-card--missing={!visibleSource}
  data-image-missing={!visibleSource}
  {href}
>
  <span class="entity-overview-card__artwork" aria-hidden={!imageAlt}>
    {#if visibleSource}
      <img
        src={visibleSource}
        alt={imageAlt}
        style:object-fit={artworkFit}
        style:object-position={artworkPosition}
        style:transform={`scale(${artworkScale})`}
        loading="lazy"
        decoding="async"
        on:error={() => (failedSource = visibleSource)}
      />
    {:else}
      <span class="entity-overview-card__fallback" aria-hidden="true">
        <span>{fallbackMark}</span>
      </span>
    {/if}
  </span>
  <span class="entity-overview-card__overlay"><slot name="overlay" /></span>
  <span class="entity-overview-card__content">
    <h3 class="entity-overview-card__title"><slot name="title" /></h3>
    <span class="entity-overview-card__metadata"><slot name="metadata" /></span>
  </span>
</a>
