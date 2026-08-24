<script lang="ts">
  export let source: string | undefined;
  export let width: number;
  export let height: number;
  export let fit: 'cover' | 'contain';
  export let alt = '';

  let failedSource: string | undefined;
  $: visibleSource = source && source !== failedSource ? source : undefined;
</script>

<div
  {...$$restProps}
  class="detail-artwork-stage"
  data-artwork-available={!!visibleSource}
  data-artwork-fit={fit}
>
  {#if visibleSource}<img
      src={visibleSource}
      {alt}
      aria-hidden={!alt}
      {width}
      {height}
      loading="eager"
      decoding="async"
      on:error={() => (failedSource = visibleSource)}
    />{/if}
</div>
