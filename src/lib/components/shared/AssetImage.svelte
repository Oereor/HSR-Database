<script lang="ts">
  import type { HTMLImgAttributes } from 'svelte/elements';
  import ImageFallback from './ImageFallback.svelte';

  // Svelte consumes this interface when typing component attributes, including rest props.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface $$Props extends Omit<HTMLImgAttributes, 'src' | 'alt' | 'class'> {
    class?: string;
    src?: string | null;
    alt?: string;
    decorative?: boolean;
    fallbackClass?: string;
    missing?: boolean;
  }

  export let src: string | null | undefined = undefined;
  export let alt = '';
  export let decorative = false;
  export let fallbackClass = '';
  export let missing = false;
  let className = '';
  export { className as class };

  type Attempt = { source: string | undefined; failed: boolean };
  let attempt: Attempt;
  // A new attempt also permits A -> B -> A retries, without caching failed URLs.
  $: attempt = { source: src?.trim() ? src : undefined, failed: false };
  $: missing = !attempt.source || attempt.failed;

  function observeImage(node: HTMLImageElement, current: Attempt) {
    let active = true;
    const fail = () => {
      if (active && attempt === current) attempt = { ...current, failed: true };
    };
    node.addEventListener('error', fail);
    // The request may already have failed before hydration attached its listener.
    if (node.complete && node.naturalWidth === 0) fail();
    return {
      destroy() {
        active = false;
        node.removeEventListener('error', fail);
      }
    };
  }
</script>

{#key src}
  {#if !missing}
    <img
      {...$$restProps}
      class={className || undefined}
      src={attempt.source}
      alt={decorative ? '' : alt}
      use:observeImage={attempt}
    />
  {:else if !decorative}
    <ImageFallback
      class={fallbackClass}
      label={$$restProps['aria-hidden'] === true || $$restProps['aria-hidden'] === 'true'
        ? ''
        : alt}
    />
  {/if}
{/key}
