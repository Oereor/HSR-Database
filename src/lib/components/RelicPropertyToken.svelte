<script lang="ts">
  import type { RelicProperty } from '$lib/domain/types';
  import { getRelicPropertyIconUrl } from '$lib/data/visual-assets';

  export let property: RelicProperty;
  export let chip = false;

  let failedSource: string | undefined;
  $: imageUrl = getRelicPropertyIconUrl(property.iconKey);
  $: visibleSource = imageUrl && imageUrl !== failedSource ? imageUrl : undefined;
</script>

<span class:relic-property-token--chip={chip} class="relic-property-token">
  {#if visibleSource}<img
      src={visibleSource}
      alt=""
      loading="lazy"
      decoding="async"
      on:error={() => (failedSource = visibleSource)}
    />{/if}
  <span>{property.name}</span>
</span>
