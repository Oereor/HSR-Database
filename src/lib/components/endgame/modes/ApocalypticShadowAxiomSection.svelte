<script lang="ts">
  import type { ApocalypticShadowAxiomSetView } from '$lib/domain/endgame-view';
  import SelectableOptionCard from '../mechanics/SelectableOptionCard.svelte';

  export let axiomSet: ApocalypticShadowAxiomSetView;
</script>

<section class="endgame-slot-mechanics" data-endgame-mechanics="axiom">
  <div class="endgame-slot-mechanics__heading">
    <h4>终焉公理</h4>
    <span class="endgame-mechanics-label">三选一</span>
  </div>
  <div class="endgame-option-grid">
    {#each axiomSet.options as option (option.order)}
      <SelectableOptionCard {option} headingLevel={5} />
    {/each}
  </div>
</section>
