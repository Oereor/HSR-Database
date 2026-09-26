<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import type { RelicProperty } from '$lib/domain/types';
  import { getRelicPropertyIconUrl } from '$lib/data/visual-assets';

  export let property: RelicProperty;
  export let chip = false;

  $: imageUrl = getRelicPropertyIconUrl(property.iconKey);
</script>

<span class:relic-property-token--chip={chip} class="relic-property-token">
  <AssetImage decorative src={imageUrl} alt="" loading="lazy" decoding="async" />
  <span>{property.name}</span>
</span>
