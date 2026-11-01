<script lang="ts">
  import { Separator } from '$lib/components/ui/separator';
  import EffectExplanationSection from '$lib/components/shared/EffectExplanationSection.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import type { ApocalypticShadowSlotGuideView } from '$lib/domain/endgame-view';
  import MechanicEntry from '../mechanics/MechanicEntry.svelte';
  import { m } from '$lib/paraglide/messages.js';

  export let traits: ApocalypticShadowSlotGuideView['traits'];
</script>

<section class="as-boss-traits min-w-0" data-endgame-mechanics="boss-traits">
  <SectionHeading level={2} headingLevel={4}>{m.endgame_boss_traits()}</SectionHeading>
  <div
    class="as-boss-traits__list [&_.enemy-extra-effects__body]:bg-muted/20 grid min-w-0 gap-4 [&_.effect-explanations]:mt-3 [&_.effect-explanations]:max-w-[72ch] [&_.endgame-mechanic-entry__title]:text-sm [&_.endgame-mechanic-entry>p]:max-w-[72ch] [&_.enemy-extra-effects__body]:px-4 [&_.enemy-extra-effects__body]:py-3"
    data-as-boss-traits
  >
    {#each traits as trait, index (trait.order)}
      {#if index > 0}<Separator />{/if}
      <MechanicEntry mechanic={trait} headingLevel={5}>
        <EffectExplanationSection effects={trait.linkedEffects} context="stage-effect" />
      </MechanicEntry>
    {/each}
  </div>
</section>
