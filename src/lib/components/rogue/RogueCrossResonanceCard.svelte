<script lang="ts">
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import type { RogueCrossResonance } from '$lib/domain/rogue';
  import RogueCardShell from './RogueCardShell.svelte';
  import RoguePathVisual from './RoguePathVisual.svelte';

  export let resonance: RogueCrossResonance;
</script>

<RogueCardShell id={resonance.id} kind="cross-resonance" tier={resonance.tier}>
  <svelte:fragment slot="path">
    <RoguePathVisual main={resonance.main.path} sub={resonance.sub.path} />
  </svelte:fragment>
  <svelte:fragment slot="title"><GameText text={resonance.effect.name} /></svelte:fragment>
  <svelte:fragment slot="secondary">
    <div class="cross-owner">
      <span>主·{resonance.main.path.name}</span>
      <span>副·{resonance.sub.path.name}</span>
    </div>
  </svelte:fragment>
  <p><GameText text={resonance.effect.description} /></p>
  <EffectExplanationSection effects={resonance.extraEffects} context="rogue" />
</RogueCardShell>

<style>
  .cross-owner {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
    color: var(--text-secondary);
    font-size: var(--font-internal);
  }
  .cross-owner span {
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-capsule);
    padding: 0.26rem 0.58rem;
    white-space: nowrap;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.75;
  }
  @media (max-width: 640px) {
    .cross-owner {
      justify-content: flex-start;
    }
  }
</style>
