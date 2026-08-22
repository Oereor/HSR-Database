<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameMechanicView, PureFictionCacophonyView } from '$lib/domain/endgame-view';
  import MechanicSurface from '../mechanics/MechanicSurface.svelte';
  import SelectableOptionCard from '../mechanics/SelectableOptionCard.svelte';

  export let fixedMechanics: EndgameMechanicView[] = [];
  export let cacophony: PureFictionCacophonyView | undefined = undefined;
</script>

{#if fixedMechanics.length}
  <section class="endgame-mechanics-section" data-endgame-mechanics="battle-will">
    <div class="section-heading"><h2>战意机制</h2></div>
    <MechanicSurface>
      <div class="endgame-mechanic-entry-list">
        {#each fixedMechanics as mechanic (mechanic.id)}
          <article class="endgame-mechanic-entry">
            <h3><GameText text={mechanic.name} /></h3>
            <p><GameText text={mechanic.description} /></p>
          </article>
        {/each}
      </div>
    </MechanicSurface>
  </section>
{/if}

{#if cacophony?.options.length}
  <section class="endgame-mechanics-section" data-endgame-mechanics="cacophony">
    <div class="section-heading">
      <h2>荒腔走板</h2>
      <span class="endgame-mechanics-label">三选一 · 每队</span>
    </div>
    <div class="endgame-option-grid">
      {#each cacophony.options as option (option.order)}
        <SelectableOptionCard {option} />
      {/each}
    </div>
  </section>
{/if}
