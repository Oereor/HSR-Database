<script lang="ts">
  import RarityStars from '$lib/components/RarityStars.svelte';
  import type { RoguePresentationTier } from '$lib/domain/rogue';

  export let tier: RoguePresentationTier;
</script>

<span
  class="rogue-tier-tag"
  data-rogue-tier={tier.stars}
  style={`--rogue-tier-color:${tier.color}`}
>
  <RarityStars rarity={tier.stars} color={tier.color} />
</span>

<style>
  .rogue-tier-tag {
    display: inline-flex;
    min-height: 1.85rem;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--rogue-tier-color) 34%, rgb(255 255 255 / 10%));
    border-radius: 999px;
    background: color-mix(in srgb, var(--rogue-tier-color) 8%, rgb(7 10 18 / 86%));
    padding: 0.3rem 0.62rem;
    backdrop-filter: blur(8px);
    font-size: 0.86rem;
    pointer-events: none;
  }
</style>
