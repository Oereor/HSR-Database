<script lang="ts">
  import type { ApocalypticShadowEncounterView } from '$lib/domain/endgame-view';
  import ApocalypticShadowNodeSection from '../as/ApocalypticShadowNodeSection.svelte';
  import ApocalypticShadowMechanicsSection from './ApocalypticShadowMechanicsSection.svelte';

  export let encounter: ApocalypticShadowEncounterView;
</script>

{#if encounter.aftertaste}
  <div class="endgame-group-mechanics">
    <ApocalypticShadowMechanicsSection mechanic={encounter.aftertaste} />
  </div>
{/if}

<div class="as-node-list">
  {#each encounter.battles as battle (battle.slot)}
    <ApocalypticShadowNodeSection {battle} />
  {/each}
</div>

<style>
  .as-node-list {
    display: grid;
    min-width: 0;
    gap: var(--space-12);
  }

  @media (max-width: 520px) {
    .as-node-list {
      gap: var(--space-8);
    }
  }
</style>
