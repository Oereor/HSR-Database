<script lang="ts">
  import { getElementIconUrl, getPathIconUrl } from '$lib/data/visual-assets';

  export let kind: 'element' | 'path';
  export let code: string | undefined;
  export let label: string;
  export let color: string | undefined = undefined;
  export let size: 'default' | 'large' = 'default';
  export let showLabel = true;

  let failedSource: string | undefined;
  $: source = kind === 'element' ? getElementIconUrl(code) : getPathIconUrl(code);
  $: visibleSource = source && source !== failedSource ? source : undefined;
</script>

<span
  class="semantic-icon-label"
  style:color
  data-icon-kind={kind}
  data-icon-missing={!visibleSource}
  data-label-size={size}
  role={showLabel ? undefined : 'img'}
  aria-label={showLabel ? undefined : label}
>
  {#if visibleSource}<img
      src={visibleSource}
      alt=""
      aria-hidden="true"
      width="64"
      height="64"
      loading="lazy"
      decoding="async"
      on:error={() => (failedSource = visibleSource)}
    />{/if}
  {#if showLabel}<span>{label}</span>{/if}
</span>
