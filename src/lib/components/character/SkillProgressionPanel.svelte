<script lang="ts">
  import type { SkillProgression, SkillVariant } from '$lib/domain/types';
  import SkillVariantView from '$lib/components/character/SkillVariantView.svelte';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import * as m from '$lib/paraglide/messages.js';
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';

  export let progression: SkillProgression;
  export let variants: SkillVariant[];
  export let categoryLabel: string;
  export let showGroupLabel = false;
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects:
    ((trigger: HTMLButtonElement, level: number) => void) | undefined = undefined;
  export let playerLevel: number | null | undefined = undefined;

  let selectedIndex = Math.max(
    0,
    progression.availableLevels.findIndex((level) => level === progression.defaultLevel)
  );
  $: playerMode = playerLevel !== undefined;
  $: resolvedPlayerLevel = playerLevel === null ? null : playerLevel;
  $: if (resolvedPlayerLevel !== null && resolvedPlayerLevel !== undefined) {
    const playerIndex = progression.availableLevels.indexOf(resolvedPlayerLevel);
    if (playerIndex >= 0) selectedIndex = playerIndex;
  }
  $: selectedLevel = progression.availableLevels[selectedIndex] ?? progression.defaultLevel;
</script>

<div class="skill-progression-group">
  {#if showGroupLabel}<p class="progression-group-label">
      {variants.map((variant) => gameTextToPlain(variant.name)).join(' / ')}
    </p>{/if}
  {#if playerMode && playerLevel === null}
    <div
      class="skill-level-control skill-level-control--unresolved"
      data-player-skill-state="unresolved"
    >
      <div>
        <span class="skill-level-control__label">{m.skill_level({ category: categoryLabel })}</span>
        <output>-</output>
      </div>
      <p>{m.player_character_skill_level_unknown()}</p>
    </div>
  {:else if progression.availableLevels.length > 1}
    <LevelSlider
      id={`skill-progression-${progression.id}`}
      label={m.skill_level({ category: categoryLabel })}
      bind:value={selectedIndex}
      min={0}
      max={progression.availableLevels.length - 1}
      displayValue={selectedLevel}
      ariaValueMin={progression.availableLevels[0]}
      ariaValueMax={progression.availableLevels.at(-1) ?? progression.availableLevels[0]}
      interactive={!playerMode}
    />
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
