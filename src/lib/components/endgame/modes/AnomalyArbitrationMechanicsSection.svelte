<script lang="ts">
  import type {
    AnomalyArbitrationJudgmentQuadrantView,
    EndgameMechanicView
  } from '$lib/domain/endgame-view';
  import CompactTraitCard from '../mechanics/CompactTraitCard.svelte';
  import SelectableOptionCard from '../mechanics/SelectableOptionCard.svelte';

  export let traits: EndgameMechanicView[] = [];
  export let judgmentQuadrant: AnomalyArbitrationJudgmentQuadrantView | undefined = undefined;

  $: hasQuadrant = !!judgmentQuadrant?.options.length;
  $: paired = traits.length > 0 && hasQuadrant;
</script>

{#if traits.length || hasQuadrant}
  <div
    class:endgame-aa-mechanics-composition--paired={paired}
    class="endgame-aa-mechanics-composition"
    data-aa-mechanics-composition
  >
    {#if traits.length}
      <section
        class="endgame-mechanics-section endgame-aa-mechanics-composition__traits"
        data-endgame-mechanics="chess-traits"
      >
        <div class="section-heading"><h2>棋局特性</h2></div>
        <div class="endgame-trait-grid">
          {#each traits as trait (trait.id)}
            <CompactTraitCard {trait} />
          {/each}
        </div>
      </section>
    {/if}

    {#if judgmentQuadrant?.options.length}
      <section
        class="endgame-mechanics-section endgame-mechanics-section--selectable endgame-aa-mechanics-composition__quadrant"
        data-endgame-mechanics="judgment-quadrant"
      >
        <div class="section-heading">
          <h2>裁决象限</h2>
          <span class="endgame-mechanics-label">三选一</span>
        </div>
        <div class="endgame-option-grid endgame-option-grid--comparison endgame-option-grid--aa">
          {#each judgmentQuadrant.options as option (option.order)}
            <SelectableOptionCard {option} />
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}
