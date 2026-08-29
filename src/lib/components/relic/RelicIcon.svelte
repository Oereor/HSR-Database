<script lang="ts">
  export let source: string | undefined;
  export let alt: string;
  export let fallbackLabel: string;
  export let presentation: 'hero' | 'card' = 'card';

  let failedSource: string | undefined;
  $: visibleSource = source && source !== failedSource ? source : undefined;
  $: fallbackMark = fallbackLabel.trim().slice(0, 1) || '遗';
</script>

<div
  class="relic-icon-stage relic-icon-stage--{presentation}"
  data-image-missing={!visibleSource}
  data-relic-icon-presentation={presentation}
>
  {#if visibleSource}
    <img
      src={visibleSource}
      {alt}
      width="128"
      height="128"
      loading={presentation === 'hero' ? 'eager' : 'lazy'}
      decoding="async"
      on:error={() => (failedSource = visibleSource)}
    />
  {:else}
    <span class="relic-icon-stage__fallback" aria-hidden="true">{fallbackMark}</span>
  {/if}
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
    background:
      radial-gradient(circle at 58% 42%, rgb(215 181 109 / 13%), transparent 22%),
      linear-gradient(145deg, rgb(255 255 255 / 3%), transparent 55%);
    padding: 2rem 2rem 9rem;
  }

  .relic-icon-stage--card {
    min-height: 184px;
    border-bottom: 1px solid rgb(255 255 255 / 5%);
    background:
      radial-gradient(circle at 50% 56%, rgb(215 181 109 / 11%), transparent 45%),
      linear-gradient(180deg, rgb(255 255 255 / 2%), transparent);
  }

  img {
    display: block;
    width: 128px;
    height: 128px;
    max-width: 100%;
    flex: 0 0 auto;
    object-fit: contain;
  }

  .relic-icon-stage--hero img {
    transform: translate(18%, -12%);
    filter: drop-shadow(0 1rem 1.25rem rgb(0 0 0 / 34%));
  }

  .relic-icon-stage__fallback {
    display: grid;
    width: 5rem;
    height: 5rem;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: rgb(7 10 18 / 58%);
    color: rgb(215 181 109 / 38%);
    font-family: serif;
    font-size: 2rem;
  }

  @media (max-width: 520px) {
    .relic-icon-stage--hero {
      padding: 1.5rem 1.5rem 10rem;
    }

    .relic-icon-stage--hero img {
      transform: translate(12%, -10%);
    }
  }
</style>
