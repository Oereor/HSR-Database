<script lang="ts">
  import { getRarityColor } from '$lib/domain/rarity';

  export let rarity: number;
  export let size: 'default' | 'hero' | 'compact' = 'default';
  export let color: string | undefined = undefined;

  $: resolvedColor = color ?? getRarityColor(rarity);
  $: stars = '★'.repeat(Math.max(0, rarity));
</script>

<span
  class="rarity-stars"
  aria-label={`${rarity}星`}
  data-rarity-size={size}
  style:color={resolvedColor}>{stars}</span
>

<style>
  .rarity-stars {
    letter-spacing: 0.06em;
    text-shadow: 0 0 10px currentColor;
  }

  .rarity-stars[data-rarity-size='hero'] {
    flex-basis: 100%;
    font-size: 1rem;
    letter-spacing: 0.12em;
  }

  .rarity-stars[data-rarity-size='compact'] {
    font-size: 0.75rem;
  }
</style>
