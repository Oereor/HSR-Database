<script lang="ts">
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import type { RogueEquation } from '$lib/domain/rogue';
  import RogueCardShell from './RogueCardShell.svelte';
  import RoguePathVisual from './RoguePathVisual.svelte';

  export let equation: RogueEquation;
</script>

<RogueCardShell
  id={equation.id}
  kind={equation.kind === 'critical' ? 'critical-equation' : 'equation'}
  tier={equation.tier}
>
  <svelte:fragment slot="path">
    <RoguePathVisual main={equation.main.path} sub={equation.sub?.path} />
  </svelte:fragment>
  <svelte:fragment slot="title"><GameText text={equation.effect.name} /></svelte:fragment>
  <svelte:fragment slot="secondary">
    <div class="equation-requirements" data-equation-requirements>
      <span>{equation.main.path.name} × {equation.main.count}</span>
      {#if equation.sub}<span>{equation.sub.path.name} × {equation.sub.count}</span>{/if}
    </div>
  </svelte:fragment>

  <p class="rogue-description"><GameText text={equation.effect.description} /></p>
  <EffectExplanationSection effects={equation.extraEffects} context="rogue" />
</RogueCardShell>

<style>
  .equation-requirements {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
    color: var(--text-secondary);
    font-size: var(--font-internal);
  }
  .equation-requirements span {
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-capsule);
    padding: 0.26rem 0.58rem;
    background: rgb(4 10 23 / 45%);
    white-space: nowrap;
  }
  .rogue-description {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.75;
  }
  @media (max-width: 640px) {
    .equation-requirements {
      justify-content: flex-start;
    }
  }
</style>
