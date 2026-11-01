<script lang="ts">
  import { cn } from '$lib/utils.js';
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
  class={cn(
    'detail-artwork-stage absolute inset-0 z-0 overflow-hidden',
    fit === 'contain' && 'p-4 sm:p-6'
  )}
  data-artwork-available={!imageMissing}
  data-artwork-fit={fit}
>
  <AssetImage
    class={cn('block size-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
    src={source}
    {alt}
    aria-hidden={!alt}
    {width}
    {height}
    loading="eager"
    decoding="async"
    bind:missing={imageMissing}
    fallbackClass="detail-artwork-stage__fallback size-full text-2xl"
  />
</div>
