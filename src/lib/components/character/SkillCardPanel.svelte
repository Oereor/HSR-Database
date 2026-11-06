<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import SkillProgressionPanel from '$lib/components/character/SkillProgressionPanel.svelte';
  import SkillVariantView from '$lib/components/character/SkillVariantView.svelte';
  import type { SkillCard, SkillVariant } from '$lib/domain/types';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { PlayerCharacter } from '$lib/player/contract';
  import { createPlayerSkillTreeIndex, resolvePlayerSkillLevel } from '$lib/player/character';

  import type { SkillPreviewControl } from '$lib/domain/character-preview';

  export let previewControls: Record<string, SkillPreviewControl> | undefined = undefined;
  export let onPreviewLevelChange: ((progressionId: string, level: number) => void) | undefined =
    undefined;
  export let card: SkillCard;
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects:
    ((trigger: HTMLButtonElement, level: number) => void) | undefined = undefined;
  export let playerSkillTree: PlayerCharacter['skillTree'] | undefined = undefined;

  $: fixedVariants = card.variants.filter((variant) => !variant.progressionId);
  $: fixedVariantsNeedDivider = card.progressions.length > 0;
  const fixedLevel = (variant: SkillVariant) => variant.levels[0];
  $: iconUrl = getCharacterDetailIconUrl(card.iconKey);
  $: playerSkillTreeIndex = playerSkillTree
    ? createPlayerSkillTreeIndex(playerSkillTree)
    : undefined;
</script>

<Card.Root role="article" class="skill-card h-full gap-0" data-skill-category={card.category}>
  <Card.Header class="skill-card__heading pb-3">
    <Card.Title class="skill-card__title--icon flex items-center gap-2 text-xl">
      <AssetImage
        src={iconUrl}
        alt=""
        class="size-7 shrink-0 object-contain"
        fallbackClass="skill-card__icon-fallback size-7 shrink-0"
      /><span>{card.displayLabel}</span>
    </Card.Title>
  </Card.Header>
  <Separator class="mx-6 w-auto data-horizontal:w-auto" />
  <Card.Content class="text-secondary-foreground pt-4 [&_p]:text-base [&_p]:leading-relaxed">
    {#each card.progressions as progression, index (progression.id)}
      {#if index > 0}<Separator class="my-4" />{/if}
      <SkillProgressionPanel
        {progression}
        controlId={`skill-progression-${card.category}-${progression.id}`}
        previewControl={previewControls?.[progression.id]}
        onPreviewLevelChange={(level) => onPreviewLevelChange?.(progression.id, level)}
        variants={card.variants.filter((variant) => progression.variantIds.includes(variant.id))}
        categoryLabel={card.displayLabel}
        showGroupLabel={card.progressions.length > 1}
        {specialEffectsAvailable}
        {specialEffectIconUrl}
        {onOpenSpecialEffects}
        playerLevel={playerSkillTreeIndex
          ? resolvePlayerSkillLevel(progression, playerSkillTreeIndex)
          : undefined}
      />
    {/each}
    {#if fixedVariants.length}
      {#if fixedVariantsNeedDivider}<Separator class="my-4" />{/if}
      <div class="skill-variant-list fixed-variant-list mt-4 pt-4">
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
  </Card.Content>
</Card.Root>
