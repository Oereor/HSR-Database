<script lang="ts">
  import type {
    ApocalypticShadowAxiomSetView,
    ApocalypticShadowSlotGuideView
  } from '$lib/domain/endgame-view';
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import MechanicEntry from '../mechanics/MechanicEntry.svelte';
  import MechanicSurface from '../mechanics/MechanicSurface.svelte';

  export let axiomSet: ApocalypticShadowAxiomSetView | undefined = undefined;
  export let bossGuide: ApocalypticShadowSlotGuideView | undefined = undefined;
</script>

<div class="as-boss-mechanics" data-as-boss-mechanics>
  {#if axiomSet?.options.length}
    <section class="as-boss-mechanics__section" data-endgame-mechanics="axiom">
      <header>
        <h4>终焉公理</h4>
        <span class="endgame-mechanics-label">三选一</span>
      </header>
      <MechanicSurface>
        <div class="as-boss-mechanics__entries" data-as-axiom-options>
          {#each axiomSet.options as option (option.order)}
            <MechanicEntry mechanic={option} headingLevel={5} />
          {/each}
        </div>
      </MechanicSurface>
    </section>
  {/if}

  {#if bossGuide?.traits.length}
    <section class="as-boss-mechanics__section" data-endgame-mechanics="boss-traits">
      <header><h4>关卡效果</h4></header>
      <MechanicSurface>
        <div class="as-boss-mechanics__entries" data-as-boss-traits>
          {#each bossGuide.traits as trait (trait.order)}
            <MechanicEntry mechanic={trait} headingLevel={5}>
              <EffectExplanationSection effects={trait.linkedEffects} context="stage-effect" />
            </MechanicEntry>
          {/each}
        </div>
      </MechanicSurface>
    </section>
  {/if}
</div>
