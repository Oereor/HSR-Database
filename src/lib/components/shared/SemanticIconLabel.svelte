<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getElementIconUrl, getPathIconUrl } from '$lib/data/visual-assets';

  export let kind: 'element' | 'path';
  export let code: string | undefined;
  export let label: string;
  export let color: string | undefined = undefined;
  export let size: 'default' | 'large' | 'hero' = 'default';
  export let presentation:
    'plain' | 'path-identity' | 'character-element-identity' | 'overview-icon' = 'plain';
  export let showLabel = true;

  $: source = kind === 'element' ? getElementIconUrl(code) : getPathIconUrl(code);
  let imageMissing = false;
</script>

<span
  class="semantic-icon-label"
  style:color
  data-icon-kind={kind}
  data-icon-missing={imageMissing || !source}
  data-label-size={size}
  data-icon-presentation={presentation}
  role={showLabel ? undefined : 'img'}
  aria-label={showLabel ? undefined : label}
>
  <AssetImage
    src={source}
    alt=""
    decorative={showLabel}
    width="64"
    height="64"
    loading="lazy"
    decoding="async"
    bind:missing={imageMissing}
    fallbackClass="semantic-icon-label__fallback"
  />
  {#if showLabel}<span class="semantic-icon-label__text">{label}</span>{/if}
</span>

<style>
  .semantic-icon-label {
    display: inline-flex;
    align-items: center;
    gap: var(--semantic-icon-gap, 0.32rem);
  }

  .semantic-icon-label :global(img) {
    display: block;
    width: var(--semantic-icon-image-size, 1rem);
    height: var(--semantic-icon-image-size, 1rem);
    flex: 0 0 auto;
    object-fit: contain;
  }

  .semantic-icon-label__text {
    position: var(--semantic-icon-label-position, static);
    display: inline;
    width: var(--semantic-icon-label-width, auto);
    height: var(--semantic-icon-label-height, auto);
    overflow: var(--semantic-icon-label-overflow, visible);
    clip: var(--semantic-icon-label-clip, auto);
    clip-path: var(--semantic-icon-label-clip-path, none);
    white-space: var(--semantic-icon-label-white-space, normal);
  }

  .semantic-icon-label :global(.semantic-icon-label__fallback) {
    width: var(--semantic-icon-image-size, 1rem);
    height: var(--semantic-icon-image-size, 1rem);
    flex: 0 0 auto;
    border: 1px solid currentColor;
    border-radius: 50%;
    --image-fallback-font-size: calc(var(--semantic-icon-image-size, 1rem) * 0.42);
  }

  .semantic-icon-label[data-label-size='large'] {
    gap: 0.42rem;
    font-size: 0.8rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .semantic-icon-label[data-label-size='large'] :global(img),
  .semantic-icon-label[data-label-size='large'] :global(.semantic-icon-label__fallback) {
    width: 1.15rem;
    height: 1.15rem;
  }

  .semantic-icon-label[data-label-size='hero'] {
    gap: 0.58rem;
    padding: 0.55rem 0.85rem;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .semantic-icon-label[data-label-size='hero'] :global(img),
  .semantic-icon-label[data-label-size='hero'] :global(.semantic-icon-label__fallback) {
    width: 1.5rem;
    height: 1.5rem;
  }

  .semantic-icon-label[data-icon-presentation='path-identity'][data-label-size='large'],
  .semantic-icon-label[data-icon-presentation='character-element-identity'][data-label-size='large'] {
    min-width: 0;
    flex: 0 1 auto;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgb(255 255 255 / 3%);
    padding: 0.38rem 0.68rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .semantic-icon-label[data-icon-presentation='path-identity'][data-label-size='hero'],
  .semantic-icon-label[data-icon-presentation='character-element-identity'][data-label-size='hero'] {
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: rgb(7 10 18 / 72%);
    color: var(--gold-soft);
    font-weight: 500;
  }

  .semantic-icon-label[data-icon-presentation='path-identity'][data-label-size='default'] {
    color: var(--text-secondary);
  }

  .semantic-icon-label[data-icon-presentation='overview-icon'] {
    --semantic-icon-image-size: var(--space-8);

    width: calc(var(--space-8) + var(--space-2));
    height: calc(var(--space-8) + var(--space-2));
    flex: 0 0 auto;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: rgb(255 255 255 / 3%);
    color: var(--text-secondary);
  }

  .semantic-icon-label[data-icon-presentation='overview-icon'] :global(img) {
    width: var(--semantic-icon-image-size);
    height: var(--semantic-icon-image-size);
  }
</style>
