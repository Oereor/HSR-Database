<script lang="ts">
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import type { RogueBlessing, RogueBlessingLevel } from '$lib/domain/rogue';
  import RogueCardShell from './RogueCardShell.svelte';
  import RoguePathVisual from './RoguePathVisual.svelte';

  export let blessing: RogueBlessing;

  let selectedLevel: 1 | 2 = 1;
  $: level = blessing.levels.find((item) => item.level === selectedLevel) as RogueBlessingLevel;
</script>

<RogueCardShell id={blessing.id} kind="blessing" tier={blessing.tier}>
  <svelte:fragment slot="path"><RoguePathVisual main={blessing.path} /></svelte:fragment>
  <svelte:fragment slot="title"><GameText text={level.effect.name} /></svelte:fragment>
  <svelte:fragment slot="secondary">
    <div class="blessing-levels" role="group" aria-label={`${level.effect.name}等级`}>
      <button
        type="button"
        class:active={selectedLevel === 1}
        aria-pressed={selectedLevel === 1}
        on:click={() => (selectedLevel = 1)}>普通</button
      >
      <button
        type="button"
        class:active={selectedLevel === 2}
        aria-pressed={selectedLevel === 2}
        on:click={() => (selectedLevel = 2)}>加强</button
      >
    </div>
  </svelte:fragment>

  <div data-rogue-blessing={blessing.id} data-blessing-level={selectedLevel}>
    <p class="rogue-description"><GameText text={level.effect.description} /></p>
    <EffectExplanationSection effects={blessing.extraEffects} context="rogue" />
  </div>
</RogueCardShell>

<style>
  .blessing-levels {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-capsule);
    background: rgb(4 10 23 / 48%);
  }
  button {
    border: 0;
    padding: 0.32rem 0.7rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-internal);
  }
  button + button {
    border-left: 1px solid var(--surface-border);
  }
  button.active {
    background: color-mix(in srgb, var(--rogue-accent) 22%, transparent);
    color: var(--text-primary);
  }
  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }
  .rogue-description {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.75;
  }
</style>
