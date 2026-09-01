<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import type { PureFictionEncounterView, PureFictionGroupView } from '$lib/domain/endgame-view';
  import EndgameNodeSection from '../EndgameNodeSection.svelte';
  import PureFictionMechanicsSection from './PureFictionMechanicsSection.svelte';

  export let group: PureFictionGroupView;
  export let encounter: PureFictionEncounterView;
</script>

{#if group.fixedMechanics.length || group.cacophony}
  <div class="endgame-group-mechanics">
    <PureFictionMechanicsSection
      fixedMechanics={group.fixedMechanics}
      cacophony={group.cacophony}
    />
  </div>
{/if}

<section class="pf-encounter-heading" aria-labelledby="pf-encounter-title">
  <SectionHeading level={1} id="pf-encounter-title">
    <GameText text={encounter.label} />
  </SectionHeading>
</section>

{#if encounter.baseMechanic}
  <div class="pf-encounter-mechanic">
    <PureFictionMechanicsSection fixedMechanics={[encounter.baseMechanic]} />
  </div>
{/if}

<p class="endgame-mode-note">
  本页按波次展示可能出现的敌人类型；运行时重复生成、生成次数与先后顺序已省略。
</p>

<div class="pf-node-list">
  {#each encounter.battles as battle (battle.slot)}
    <EndgameNodeSection {battle} waveLayout="stacked" enemyVariant="compact" />
  {/each}
</div>

<style>
  .pf-encounter-heading {
    min-width: 0;
  }

  .pf-encounter-mechanic {
    margin-bottom: var(--space-6);
  }

  .pf-node-list {
    display: grid;
    min-width: 0;
    gap: var(--space-12);
  }

  @media (max-width: 520px) {
    .pf-node-list {
      gap: var(--space-8);
    }
  }
</style>
