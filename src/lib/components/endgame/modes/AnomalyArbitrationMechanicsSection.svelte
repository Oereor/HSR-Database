<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type {
    AnomalyArbitrationJudgmentQuadrantView,
    EndgameMechanicView
  } from '$lib/domain/endgame-view';
  import SelectableOptionCard from '../mechanics/SelectableOptionCard.svelte';

  export let traits: EndgameMechanicView[] = [];
  export let judgmentQuadrant: AnomalyArbitrationJudgmentQuadrantView | undefined = undefined;
</script>

{#if judgmentQuadrant?.options.length}
  <section class="endgame-mechanics-section" data-endgame-mechanics="judgment-quadrant">
    <div class="section-heading">
      <h2>裁决象限</h2>
      <span class="endgame-mechanics-label">三选一</span>
    </div>
    <div class="endgame-option-grid">
      {#each judgmentQuadrant.options as option (option.order)}
        <SelectableOptionCard {option} />
      {/each}
    </div>
  </section>
{/if}

{#if traits.length}
  <section class="endgame-mechanics-section" data-endgame-mechanics="chess-traits">
    <div class="section-heading"><h2>棋局特性</h2></div>
    <div class="endgame-trait-grid">
      {#each traits as trait (trait.id)}
        <article class="endgame-trait-card">
          <h3><GameText text={trait.name} /></h3>
          <p><GameText text={trait.description} /></p>
        </article>
      {/each}
    </div>
  </section>
{/if}
