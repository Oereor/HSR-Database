<script lang="ts">
  import { getRarityColor } from '$lib/domain/rarity';

  export let rarity: number;

  $: color = getRarityColor(rarity);
  $: stars = '★'.repeat(Math.max(0, rarity));
</script>

<span class="rarity-stars" aria-label={`${rarity}星`} style:color>{stars}</span>
