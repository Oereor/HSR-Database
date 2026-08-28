<script lang="ts">
  import RarityStars from '$lib/components/RarityStars.svelte';
  import type { RoguePresentationTier } from '$lib/domain/rogue';

  export let tier: RoguePresentationTier;
</script>

<span class="rogue-tier-tag" data-rogue-tier={tier.stars}>
  <RarityStars rarity={tier.stars} color={tier.color} size="compact" />
</span>

<style>
  .rogue-tier-tag {
    display: inline-flex;
    min-height: 1.7rem;
    align-items: center;
    border: 1px solid rgb(255 255 255 / 13%);
    border-radius: 999px;
    background: rgb(7 10 18 / 74%);
    padding: 0.3rem 0.55rem;
    backdrop-filter: blur(8px);
    pointer-events: none;
  }
</style>
