<script lang="ts">
  import type { SkillProgression, SkillVariant } from '$lib/domain/types';
  import SkillVariantView from '$lib/components/SkillVariantView.svelte';
  import { gameTextToPlain } from '$lib/domain/game-text';

  export let progression: SkillProgression;
  export let variants: SkillVariant[];
  export let categoryLabel: string;
  export let showGroupLabel = false;
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects:
    ((trigger: HTMLButtonElement, level: number) => void) | undefined = undefined;

  let selectedIndex = Math.max(
    0,
    progression.availableLevels.findIndex((level) => level === progression.defaultLevel)
  );
  $: selectedLevel = progression.availableLevels[selectedIndex] ?? progression.defaultLevel;
</script>

<div class="skill-progression-group">
  {#if showGroupLabel}<p class="progression-group-label">
      {variants.map((variant) => gameTextToPlain(variant.name)).join(' / ')}
    </p>{/if}
  {#if progression.availableLevels.length > 1}
    <div class="skill-level-control">
      <div>
        <label for={`skill-progression-${progression.id}`}>{categoryLabel}等级</label>
        <output for={`skill-progression-${progression.id}`}>Lv.{selectedLevel}</output>
      </div>
      <input
        id={`skill-progression-${progression.id}`}
        type="range"
        min="0"
        max={progression.availableLevels.length - 1}
        step="1"
        bind:value={selectedIndex}
        aria-valuemin={progression.availableLevels[0]}
        aria-valuemax={progression.availableLevels.at(-1)}
        aria-valuenow={selectedLevel}
        aria-valuetext={`等级 ${selectedLevel}`}
      />
      <div class="skill-level-range" aria-hidden="true">
        <span>Lv.{progression.availableLevels[0]}</span>
        <span>Lv.{progression.availableLevels.at(-1)}</span>
      </div>
    </div>
  {/if}
  <div class="skill-variant-list">
    {#each variants as variant (variant.id)}
      <SkillVariantView
        {variant}
        {selectedLevel}
        {specialEffectsAvailable}
        {specialEffectIconUrl}
        {onOpenSpecialEffects}
      >
        <svelte:fragment slot="prefix"><slot name="variant-prefix" {variant} /></svelte:fragment>
      </SkillVariantView>
    {/each}
  </div>
</div>
