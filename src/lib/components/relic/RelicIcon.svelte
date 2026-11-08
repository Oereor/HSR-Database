<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  export let source: string | undefined;
  export let alt: string;
  export let presentation: 'hero' | 'card' | 'header' | 'piece' = 'card';

  let imageMissing = !source?.trim();
</script>

<div
  class="relic-icon-stage relic-icon-stage--{presentation}"
  data-image-missing={imageMissing}
  data-relic-icon-presentation={presentation}
>
  <AssetImage
    src={source}
    {alt}
    width="128"
    height="128"
    loading={presentation === 'hero' ? 'eager' : 'lazy'}
    decoding="async"
    bind:missing={imageMissing}
    fallbackClass="relic-icon-stage__fallback"
  />
</div>

<style>
  .relic-icon-stage {
    position: relative;
    display: grid;
    min-width: 0;
    overflow: hidden;
    place-items: center;
  }

  .relic-icon-stage--hero {
    position: absolute;
    z-index: 0;
    inset: 0;
    background: var(--secondary);
    padding: 2rem 2rem 9rem;
  }

  .relic-icon-stage--card {
    min-height: 184px;
    border-bottom: 1px solid rgb(255 255 255 / 5%);
    background: var(--secondary);
  }

  .relic-icon-stage--piece {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-control);
  }

  .relic-icon-stage.relic-icon-stage--piece :global(img) {
    width: 56px;
    height: 56px;
  }

  .relic-icon-stage.relic-icon-stage--piece :global(.relic-icon-stage__fallback) {
    width: 4rem;
    height: 4rem;
  }

  .relic-icon-stage--header {
    width: 100%;
    height: 100%;
  }

  .relic-icon-stage :global(img) {
    display: block;
    width: 128px;
    height: 128px;
    max-width: 100%;
    flex: 0 0 auto;
    object-fit: contain;
  }

  .relic-icon-stage.relic-icon-stage--hero :global(img) {
    transform: translate(18%, -12%);
    filter: drop-shadow(0 1rem 1.25rem rgb(0 0 0 / 34%));
  }

  .relic-icon-stage.relic-icon-stage--header :global(img) {
    width: 100%;
    height: 100%;
  }

  .relic-icon-stage.relic-icon-stage--header :global(.relic-icon-stage__fallback) {
    width: 3rem;
    height: 3rem;
    --image-fallback-font-size: 1.2rem;
  }

  .relic-icon-stage :global(.relic-icon-stage__fallback) {
    width: 5rem;
    height: 5rem;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: color-mix(in srgb, var(--background) 58%, transparent);
    --image-fallback-font-size: 2rem;
  }

  @media (max-width: 520px) {
    .relic-icon-stage--hero {
      padding: 1.5rem 1.5rem 10rem;
    }

    .relic-icon-stage.relic-icon-stage--hero :global(img) {
      transform: translate(12%, -10%);
    }
  }

  @media (max-width: 820px) {
    .relic-icon-stage--piece {
      width: 64px;
      height: 64px;
    }

    .relic-icon-stage.relic-icon-stage--piece :global(img) {
      width: 56px;
      height: 56px;
    }

    .relic-icon-stage.relic-icon-stage--piece :global(.relic-icon-stage__fallback) {
      width: 3rem;
      height: 3rem;
      --image-fallback-font-size: 1.2rem;
    }
  }
</style>
