<script lang="ts">
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import type { RogueBaseResonance } from '$lib/domain/rogue';
  import RogueCardShell from './RogueCardShell.svelte';
  import RoguePathVisual from './RoguePathVisual.svelte';

  export let resonance: RogueBaseResonance;
</script>

<RogueCardShell id={resonance.id} kind="resonance" tier={resonance.tier}>
  <svelte:fragment slot="path"><RoguePathVisual main={resonance.path} /></svelte:fragment>
  <svelte:fragment slot="title"><GameText text={resonance.effect.name} /></svelte:fragment>
  <p><GameText text={resonance.effect.description} /></p>
  <EffectExplanationSection effects={resonance.extraEffects} context="rogue" />
</RogueCardShell>

<style>
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.75;
  }
</style>
