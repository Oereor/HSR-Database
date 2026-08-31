<script lang="ts">
  import type {
    AnomalyArbitrationEncounterView,
    AnomalyArbitrationJudgmentQuadrantView
  } from '$lib/domain/endgame-view';
  import EndgameWaveLayout from '../EndgameWaveLayout.svelte';
  import BuffOptionGroup from '../mechanics/BuffOptionGroup.svelte';
  import MechanicSectionCard from '../mechanics/MechanicSectionCard.svelte';
  import { buildEndgameWaveGroups } from '../presentation';

  export let encounter: AnomalyArbitrationEncounterView;
  export let judgmentQuadrant: AnomalyArbitrationJudgmentQuadrantView | undefined = undefined;

  $: traitContent = {
    kind: 'segments' as const,
    items: encounter.traits.map((trait) => ({
      key: trait.id,
      title: trait.name,
      description: trait.description
    }))
  };
</script>

<div class="aa-detail" data-aa-stage-detail>
  {#if encounter.traits.length}
    <section class="aa-detail__traits" data-endgame-mechanics="chess-traits">
      <MechanicSectionCard title="棋局特性" content={traitContent} headingLevel={2} tone="debuff" />
    </section>
  {/if}

  {#if judgmentQuadrant?.options.length}
    <section class="aa-detail__quadrant" data-endgame-mechanics="judgment-quadrant">
      <BuffOptionGroup title="裁决象限" options={judgmentQuadrant.options} headingLevel={2} />
    </section>
  {/if}

  <div class="aa-detail__waves" data-aa-waves>
    {#each encounter.battles as battle (battle.slot)}
      <EndgameWaveLayout
        groups={buildEndgameWaveGroups(battle)}
        policy="paired"
        enemyVariant="standard"
      />
    {/each}
  </div>
</div>

<style>
  .aa-detail,
  .aa-detail__waves {
    display: grid;
    min-width: 0;
  }

  .aa-detail {
    gap: var(--space-8);
  }

  .aa-detail__waves {
    gap: var(--space-12);
  }

  @media (max-width: 520px) {
    .aa-detail {
      gap: var(--space-6);
    }

    .aa-detail__waves {
      gap: var(--space-8);
    }
  }
</style>
