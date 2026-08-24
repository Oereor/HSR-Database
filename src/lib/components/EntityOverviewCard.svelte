<script lang="ts">
  export let href: string;
  export let imageUrl: string | undefined = undefined;
  export let imageAlt = '';
  export let fallbackLabel: string;
  export let artworkFit: 'contain' | 'cover' | 'scale-down' = 'contain';
  export let artworkPosition = 'center bottom';
  export let artworkScale = 1;
  export let size: 'large' | 'compact' = 'large';
  export let mediaPresentation: 'artwork' | 'icon' = 'artwork';

  let failedSource: string | undefined;
  $: visibleSource = imageUrl && imageUrl !== failedSource ? imageUrl : undefined;
  $: fallbackMark = fallbackLabel.trim().slice(0, 1) || '轨';
</script>

<a
  class="entity-overview-card"
  class:entity-overview-card--missing={!visibleSource}
  class:entity-overview-card--compact={size === 'compact'}
  class:entity-overview-card--icon-media={mediaPresentation === 'icon'}
  data-image-missing={!visibleSource}
  data-card-size={size}
  data-media-presentation={mediaPresentation}
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
  <span
    class="entity-overview-card__content"
    class:entity-overview-card__content--title-only={!$$slots.metadata}
  >
    <h3 class="entity-overview-card__title"><slot name="title" /></h3>
    {#if $$slots.metadata}<span class="entity-overview-card__metadata"
        ><slot name="metadata" /></span
      >{/if}
  </span>
</a>
