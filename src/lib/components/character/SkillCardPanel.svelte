<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';
  import SkillVariantView from './SkillVariantView.svelte';
  import type { SkillCard, SkillProgression, SkillVariant } from '$lib/domain/types';
  import type { SkillPreviewControl } from '$lib/domain/character-preview';
  import type { PlayerCharacter } from '$lib/player/contract';
  import { createPlayerSkillTreeIndex, resolvePlayerSkillLevel } from '$lib/player/character';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import { m } from '$lib/paraglide/messages.js';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { Button } from '$lib/components/ui/button';

  export let card: SkillCard;
  export let seriesLevel: 1 | 2 = 1;
  export let onSeriesLevelChange: ((level: 1 | 2) => void) | undefined = undefined;
  export let onOpenSeriesEffects: ((trigger: HTMLButtonElement, level: 1 | 2) => void) | undefined =
    undefined;
  export let characterAccent: string | undefined = undefined;
  export let previewControls: Record<string, SkillPreviewControl> | undefined = undefined;
  export let onPreviewLevelChange: ((progressionId: string, level: number) => void) | undefined =
    undefined;
  export let playerSkillTree: PlayerCharacter['skillTree'] | undefined = undefined;
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects:
    ((trigger: HTMLButtonElement, level: number) => void) | undefined = undefined;

  let localLevels: Record<string, number> = {};
  $: playerIndex = playerSkillTree ? createPlayerSkillTreeIndex(playerSkillTree) : undefined;
  $: levels = Object.fromEntries(
    card.progressions.map((progression) => [
      progression.id,
      playerIndex
        ? resolvePlayerSkillLevel(progression, playerIndex)
        : (previewControls?.[progression.id]?.previewLevel ??
          localLevels[progression.id] ??
          progression.defaultLevel)
    ])
  );
  function changeLevel(progression: SkillProgression, index: number) {
    if (playerSkillTree) return;
    const level = progression.availableLevels[index];
    localLevels = { ...localLevels, [progression.id]: level };
    onPreviewLevelChange?.(progression.id, level);
  }
  const selectedLevel = (variant: SkillVariant, selected: Record<string, number | null>) =>
    (variant.progressionId ? selected[variant.progressionId] : undefined) ??
    card.progressions.find((p) => p.id === variant.progressionId)?.defaultLevel ??
    variant.levels[0]?.level ??
    1;
</script>

<Card.Root
  role="article"
  class="skill-card character-detail-card"
  data-skill-category={card.category}
>
  <Card.Header class="flex flex-row items-center justify-between gap-3">
    <Card.Title class="min-w-0 text-lg">{card.displayLabel}</Card.Title>
    <div class="skill-card__controls flex min-w-0 shrink-0 flex-col gap-2">
      {#if card.externalCondition}
        <ToggleGroup.Root
          type="single"
          variant="outline"
          size="sm"
          value={String(seriesLevel)}
          aria-label={m.series_skill_condition()}
          onValueChange={(value) => {
            if (value === '1' || value === '2') onSeriesLevelChange?.(Number(value) as 1 | 2);
          }}
        >
          <ToggleGroup.Item value="1">{m.series_skill_e0()}</ToggleGroup.Item>
          <ToggleGroup.Item value="2">{m.series_skill_e2()}</ToggleGroup.Item>
        </ToggleGroup.Root>
      {/if}
      {#each card.progressions as progression (progression.id)}
        {@const level = levels[progression.id]}
        <div data-preview-key={!playerSkillTree ? progression.id : undefined}>
          {#if card.progressions.length > 1}<span
              class="text-muted-foreground block text-xs wrap-anywhere"
              >{card.variants
                .filter((v) => progression.variantIds.includes(v.id))
                .map((v) => gameTextToPlain(v.name))
                .join(' / ')}</span
            >{/if}
          {#if level === null || progression.availableLevels.length < 2}
            <output
              class="text-foreground whitespace-nowrap tabular-nums"
              data-player-skill-state={level === null ? 'unresolved' : undefined}
              >Lv.{level ?? '—'}</output
            >
          {:else}
            <LevelSlider
              compact
              id={`skill-progression-${card.category}-${progression.id}`}
              label={m.skill_level({ category: card.displayLabel })}
              value={Math.max(0, progression.availableLevels.indexOf(level))}
              min={0}
              max={progression.availableLevels.length - 1}
              displayValue={level}
              ariaValueMin={progression.availableLevels[0]}
              ariaValueMax={progression.availableLevels.at(-1)}
              interactive={!playerSkillTree}
              onValueChange={playerSkillTree
                ? undefined
                : (index) => changeLevel(progression, index)}
            />
          {/if}
        </div>
      {/each}
    </div>
  </Card.Header>
  <Separator />
  <Card.Content
    class="text-secondary-foreground @container/skill-content space-y-4 [&_p]:text-base [&_p]:leading-relaxed"
  >
    {#if Object.values(levels).includes(null)}<p class="text-muted-foreground text-sm">
        {m.player_character_skill_level_unknown()}
      </p>{/if}
    {#each card.variants as variant, index (variant.id)}
      {#if index}<Separator />{/if}
      <SkillVariantView
        {variant}
        selectedLevel={card.externalCondition ? seriesLevel : selectedLevel(variant, levels)}
        {characterAccent}
        {specialEffectsAvailable}
        {specialEffectIconUrl}
        {onOpenSpecialEffects}
      />
    {/each}
    {#if card.externalCondition && onOpenSeriesEffects}
      <Button
        variant="outline"
        type="button"
        onclick={(event) =>
          onOpenSeriesEffects?.(event.currentTarget as HTMLButtonElement, seriesLevel)}
        >{m.series_skill_view_related()}</Button
      >
    {/if}
  </Card.Content>
</Card.Root>
