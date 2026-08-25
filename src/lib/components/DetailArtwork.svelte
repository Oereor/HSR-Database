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

<style>
  .detail-artwork-stage {
    position: absolute;
    z-index: 0;
    inset: 0;
    overflow: hidden;
    background: linear-gradient(145deg, rgb(255 255 255 / 3%), transparent 55%);
  }

  .detail-artwork-stage img {
    display: block;
    width: 100%;
    height: 100%;
  }

  .detail-artwork-stage[data-artwork-fit='cover'] img {
    object-fit: cover;
    object-position: center;
  }

  .detail-artwork-stage[data-artwork-fit='contain'] {
    padding: 1.5rem 2.5rem;
  }

  .detail-artwork-stage[data-artwork-fit='contain'] img {
    object-fit: contain;
    object-position: center;
  }
</style>
