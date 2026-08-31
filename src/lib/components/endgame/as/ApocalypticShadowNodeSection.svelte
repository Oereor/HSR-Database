<script lang="ts">
  import type { ApocalypticShadowBattleSlotView } from '$lib/domain/endgame-view';
  import EndgameNodeHeading from '../EndgameNodeHeading.svelte';
  import BuffOptionGroup from '../mechanics/BuffOptionGroup.svelte';
  import AsBossDossier from './AsBossDossier.svelte';

  export let battle: ApocalypticShadowBattleSlotView;
</script>

<section
  class="as-node-section"
  id={`battle-${battle.slot}`}
  data-as-battle-slot={battle.slot}
  data-battle-slot={battle.slot}
>
  <div class="as-node-section__heading">
    <EndgameNodeHeading slot={battle.slot} />
  </div>

  <AsBossDossier stages={battle.stages} bossGuide={battle.bossGuide} />

  {#if battle.axiomSet?.options.length}
    <section class="as-node-section__axiom" data-endgame-mechanics="axiom">
      <BuffOptionGroup
        title="终焉公理"
        options={battle.axiomSet.options}
        headingLevel={4}
        headingScale="medium"
      />
    </section>
  {/if}
</section>

<style>
  .as-node-section {
    min-width: 0;
    scroll-margin-top: 80px;
  }

  .as-node-section__heading {
    margin-bottom: var(--space-6);
  }

  .as-node-section__axiom {
    min-width: 0;
    margin-top: var(--space-8);
  }

  @media (max-width: 520px) {
    .as-node-section__axiom {
      margin-top: var(--space-6);
    }
  }
</style>
