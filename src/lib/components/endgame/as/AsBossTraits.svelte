<script lang="ts">
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import InlineDividerHeading from '$lib/components/InlineDividerHeading.svelte';
  import type { ApocalypticShadowSlotGuideView } from '$lib/domain/endgame-view';
  import MechanicEntry from '../mechanics/MechanicEntry.svelte';

  export let traits: ApocalypticShadowSlotGuideView['traits'];
</script>

<section class="as-boss-traits" data-endgame-mechanics="boss-traits">
  <div class="as-boss-traits__heading">
    <InlineDividerHeading level={4} scale="medium">首领特性</InlineDividerHeading>
  </div>
  <div class="as-boss-traits__list" data-as-boss-traits>
    {#each traits as trait (trait.order)}
      <MechanicEntry mechanic={trait} headingLevel={5}>
        <EffectExplanationSection effects={trait.linkedEffects} context="stage-effect" />
      </MechanicEntry>
    {/each}
  </div>
</section>

<style>
  .as-boss-traits {
    min-width: 0;
  }

  .as-boss-traits__heading {
    margin-bottom: var(--space-4);
  }

  .as-boss-traits__list {
    display: grid;
    min-width: 0;
  }

  .as-boss-traits__list :global(.endgame-mechanic-entry) {
    min-width: 0;
  }

  .as-boss-traits__list :global(.endgame-mechanic-entry + .endgame-mechanic-entry) {
    margin-top: var(--space-6);
    border-top: 1px solid color-mix(in srgb, var(--text-secondary) 22%, transparent);
    padding-top: var(--space-6);
  }

  .as-boss-traits__list :global(.endgame-mechanic-entry__title) {
    color: var(--text-primary);
    font-size: var(--font-meta-value);
    font-weight: 650;
  }

  .as-boss-traits__list :global(.endgame-mechanic-entry > p),
  .as-boss-traits__list :global(.effect-explanations) {
    max-width: 72ch;
  }

  .as-boss-traits__list :global(.effect-explanations) {
    margin-top: var(--space-3);
  }

  .as-boss-traits__list :global(.enemy-extra-effects__body) {
    background: rgb(255 255 255 / 1.5%);
    padding: var(--space-3) var(--space-4);
  }
</style>
