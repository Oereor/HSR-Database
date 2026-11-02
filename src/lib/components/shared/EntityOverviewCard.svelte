<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils.js';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  export let href: string;
  export let imageUrl: string | undefined = undefined;
  export let imageAlt = '';
  export let artworkFit: 'contain' | 'cover' | 'scale-down' = 'contain';
  export let artworkPosition = 'center bottom';
  export let artworkScale = 1;
  export let size: 'large' | 'compact' = 'large';
  export let density: 'default' | 'compact' = 'default';
  export let mediaPresentation: 'artwork' | 'icon' = 'artwork';
  export let metadataLayout: 'default' | 'icons' = 'default';

  export let artworkAspect: 'portrait' | 'landscape' = 'portrait';

  let imageMissing = !imageUrl?.trim();
</script>

<a
  class="entity-overview-card bg-card text-card-foreground border-border focus-visible:border-ring focus-visible:ring-ring/50 hover:border-primary/40 relative flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-xs transition-[border-color,box-shadow] outline-none hover:shadow-md focus-visible:ring-3"
  data-image-missing={imageMissing}
  data-card-size={size}
  data-card-density={density}
  data-media-presentation={mediaPresentation}
  {href}
>
  <span
    class={cn(
      'entity-overview-card__artwork bg-muted/40 border-border relative grid w-full shrink-0 place-items-center overflow-hidden border-b',
      mediaPresentation === 'icon'
        ? 'aspect-square'
        : artworkAspect === 'landscape'
          ? 'aspect-4/3'
          : 'aspect-4/5'
    )}
    aria-hidden={!imageAlt}
  >
    <AssetImage
      src={imageUrl}
      alt={imageAlt}
      class={cn(
        'absolute inset-0 m-auto block',
        mediaPresentation === 'icon' ? 'size-[70%] max-h-28 max-w-28' : 'size-full'
      )}
      style={`object-fit: ${artworkFit}; object-position: ${artworkPosition}; transform: scale(${artworkScale}); transform-origin: ${mediaPresentation === 'icon' ? 'center' : 'center bottom'};`}
      loading="lazy"
      decoding="async"
      bind:missing={imageMissing}
      fallbackClass="entity-overview-card__fallback bg-muted border-border size-20 rounded-full border text-2xl"
    />
    {#if $$slots.overlay}<span
        class="entity-overview-card__overlay absolute inset-x-2 top-2 flex justify-end"
        ><Badge
          class="bg-background/85 h-auto max-w-full py-1 text-center whitespace-normal backdrop-blur-sm"
          ><slot name="overlay" /></Badge
        ></span
      >{/if}
  </span>
  <span
    class="entity-overview-card__content flex min-w-0 flex-1 flex-col items-center gap-3 p-3 text-center sm:p-4"
  >
    <h3
      class="entity-overview-card__title m-0 min-h-[2.6em] w-full text-sm leading-snug font-semibold wrap-anywhere"
    >
      <slot name="title" />
    </h3>
    {#if $$slots.metadata}<span
        class={cn(
          'entity-overview-card__metadata mt-auto flex min-h-10 w-full min-w-0 items-center justify-center gap-2',
          metadataLayout === 'icons' ? 'flex-nowrap' : 'flex-wrap'
        )}><slot name="metadata" /></span
      >{/if}
  </span>
</a>
