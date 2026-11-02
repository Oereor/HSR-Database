<script lang="ts">
  import type { ApocalypticShadowEncounterView } from '$lib/domain/endgame-view';
  import ApocalypticShadowNodeSection from '../as/ApocalypticShadowNodeSection.svelte';
  import ApocalypticShadowMechanicsSection from './ApocalypticShadowMechanicsSection.svelte';

  export let encounter: ApocalypticShadowEncounterView;
</script>

{#if encounter.aftertaste}
  <div class="endgame-group-mechanics mb-8 [&>.endgame-mechanics-section:last-child]:mb-0">
    <ApocalypticShadowMechanicsSection mechanic={encounter.aftertaste} />
  </div>
{/if}

<div class="as-node-list grid min-w-0 gap-8 min-[521px]:gap-12">
  {#each encounter.battles as battle (battle.slot)}
    <ApocalypticShadowNodeSection {battle} />
  {/each}
</div>
