<script lang="ts">
  import SkillProgressionPanel from '$lib/components/SkillProgressionPanel.svelte';
  import SkillVariantView from '$lib/components/SkillVariantView.svelte';
  import type { SkillCard, SkillVariant } from '$lib/domain/types';

  export let card: SkillCard;
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects:
    ((trigger: HTMLButtonElement, level: number) => void) | undefined = undefined;

  $: fixedVariants = card.variants.filter((variant) => !variant.progressionId);
  $: fixedVariantsNeedDivider = card.progressions.length > 0;
  const fixedLevel = (variant: SkillVariant) => variant.levels[0];
</script>

<article class="info-card skill-card" data-skill-category={card.category}>
  <div class="info-card__heading skill-card__heading">
    <h3>{card.displayLabel}</h3>
  </div>
  {#each card.progressions as progression (progression.id)}
    <SkillProgressionPanel
      {progression}
      variants={card.variants.filter((variant) => progression.variantIds.includes(variant.id))}
      categoryLabel={card.displayLabel}
      showGroupLabel={card.progressions.length > 1}
      {specialEffectsAvailable}
      {specialEffectIconUrl}
      {onOpenSpecialEffects}
    />
  {/each}
  {#if fixedVariants.length}<div
      class:fixed-variant-list--separated={fixedVariantsNeedDivider}
      class="skill-variant-list fixed-variant-list"
    >
      {#each fixedVariants as variant (variant.id)}
        <SkillVariantView
          {variant}
          selectedLevel={fixedLevel(variant)?.level ?? 1}
          showLevel={card.category !== 'technique'}
          {specialEffectsAvailable}
          {specialEffectIconUrl}
          {onOpenSpecialEffects}
        />
      {/each}
    </div>{/if}
</article>
