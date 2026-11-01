<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  export let source: string | undefined;
  export let width: number;
  export let height: number;
  export let fit: 'cover' | 'contain';
  export let alt = '';

  let imageMissing = !source?.trim();
</script>

<div
  {...$$restProps}
  class="detail-artwork-stage"
  data-artwork-available={!imageMissing}
  data-artwork-fit={fit}
>
  <AssetImage
    src={source}
    {alt}
    aria-hidden={!alt}
    {width}
    {height}
    loading="eager"
    decoding="async"
    bind:missing={imageMissing}
    fallbackClass="detail-artwork-stage__fallback"
  />
</div>

<style>
  .detail-artwork-stage {
    position: absolute;
    z-index: 0;
    inset: 0;
    overflow: hidden;
    background: linear-gradient(145deg, rgb(255 255 255 / 3%), transparent 55%);
  }

  .detail-artwork-stage :global(img) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .detail-artwork-stage[data-artwork-fit='cover'] :global(img) {
    object-fit: cover;
    object-position: center;
  }

  .detail-artwork-stage[data-artwork-fit='contain'] {
    padding: 1.5rem 2.5rem;
  }

  .detail-artwork-stage[data-artwork-fit='contain'] :global(img) {
    object-fit: contain;
    object-position: center;
  }
  .detail-artwork-stage :global(.detail-artwork-stage__fallback) {
    width: 100%;
    height: 100%;
    --image-fallback-font-size: 2rem;
  }
</style>
