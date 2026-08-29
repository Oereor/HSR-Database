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
    <div
      class="equation-requirements"
      data-equation-requirements
      data-equation-requirement-kind={equation.kind}
    >
      <span class="equation-requirements__label">展开条件</span>
      {#if equation.kind === 'critical'}
        <span>× {equation.main.count}</span>
      {:else}
        <span>{equation.main.path.name} × {equation.main.count}</span>
        {#if equation.sub}
          <span class="equation-requirements__separator" aria-hidden="true">·</span>
          <span>{equation.sub.path.name} × {equation.sub.count}</span>
        {/if}
      {/if}
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
    gap: 0.28rem;
    color: var(--text-muted);
    font-size: var(--font-internal);
    line-height: 1.5;
    text-align: right;
  }
  .equation-requirements__label {
    margin-right: 0.18rem;
    color: color-mix(in srgb, var(--rogue-accent) 70%, var(--text-muted));
  }
  .equation-requirements__separator {
    color: var(--surface-border-strong);
  }
  .rogue-description {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.82;
  }
  @media (max-width: 640px) {
    .equation-requirements {
      justify-content: flex-start;
    }
  }
</style>
