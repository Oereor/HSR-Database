<script lang="ts">
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import type { RogueResonanceEnhancementGroup } from '$lib/domain/rogue';
  import RogueCardShell from './RogueCardShell.svelte';
  import RoguePathVisual from './RoguePathVisual.svelte';

  export let group: RogueResonanceEnhancementGroup;
</script>

<RogueCardShell id={group.id} kind="enhancement-group" tier={group.tier}>
  <svelte:fragment slot="path"><RoguePathVisual main={group.path} /></svelte:fragment>
  <svelte:fragment slot="title">{group.path.name}·回响构音</svelte:fragment>
  <div class="enhancement-list" data-enhancement-list>
    {#each group.effects as enhancement (enhancement.id)}
      <section data-enhancement-effect={enhancement.id}>
        <h4><GameText text={enhancement.effect.name} /></h4>
        <p><GameText text={enhancement.effect.description} /></p>
        <EffectExplanationSection effects={enhancement.extraEffects} context="rogue" />
      </section>
    {/each}
  </div>
</RogueCardShell>

<style>
  .enhancement-list {
    display: flex;
    flex-direction: column;
  }
  section {
    min-width: 0;
    padding: var(--space-3) 0;
  }
  section:first-child {
    padding-top: 0;
  }
  section:last-child {
    padding-bottom: 0;
  }
  section + section {
    border-top: 1px solid var(--surface-border);
  }
  h4 {
    margin: 0 0 var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-card-title);
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.75;
  }
</style>
