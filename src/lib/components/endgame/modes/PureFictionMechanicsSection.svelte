<script lang="ts">
  import type { EndgameMechanicView, PureFictionCacophonyView } from '$lib/domain/endgame-view';
  import MechanicEntry from '../mechanics/MechanicEntry.svelte';
  import MechanicSurface from '../mechanics/MechanicSurface.svelte';
  import SelectableOptionCard from '../mechanics/SelectableOptionCard.svelte';

  export let fixedMechanics: EndgameMechanicView[] = [];
  export let cacophony: PureFictionCacophonyView | undefined = undefined;
</script>

{#if fixedMechanics.length}
  <section
    class="endgame-mechanics-section endgame-mechanics-section--fixed"
    data-endgame-mechanics="battle-will"
  >
    <MechanicSurface title="战意机制" headingLevel={2} accent>
      <div class="endgame-mechanic-entry-list">
        {#each fixedMechanics as mechanic (mechanic.id)}
          <MechanicEntry {mechanic} />
        {/each}
      </div>
    </MechanicSurface>
  </section>
{/if}

{#if cacophony?.options.length}
  <section
    class="endgame-mechanics-section endgame-mechanics-section--selectable"
    data-endgame-mechanics="cacophony"
  >
    <div class="section-heading">
      <h2>荒腔走板</h2>
      <span class="endgame-mechanics-label">三选一 · 每队</span>
    </div>
    <div class="endgame-option-grid endgame-option-grid--comparison endgame-option-grid--pf">
      {#each cacophony.options as option (option.order)}
        <SelectableOptionCard {option} />
      {/each}
    </div>
  </section>
{/if}
