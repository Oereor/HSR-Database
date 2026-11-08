<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import type { RelicProperty } from '$lib/domain/types';
  import { getRelicPropertyIconUrl } from '$lib/data/visual-assets';

  export let property: RelicProperty;
  export let chip = false;

  $: imageUrl = getRelicPropertyIconUrl(property.iconKey);
</script>

<span class:relic-property-token--chip={chip} class="relic-property-token">
  <AssetImage
    class="size-5.5 shrink-0 object-contain"
    decorative
    src={imageUrl}
    alt=""
    loading="lazy"
    decoding="async"
  />
  <span class="min-w-0 wrap-anywhere">{property.name}</span>
</span>

<style>
  .relic-property-token {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: var(--space-2);
    color: var(--foreground);
    font-size: var(--font-meta-value);
    line-height: 1.5;
  }

  .relic-property-token--chip {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--secondary);
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-helper);
  }
</style>
