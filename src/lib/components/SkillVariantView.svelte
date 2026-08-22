<script lang="ts">
  import DescriptionText from '$lib/components/DescriptionText.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import SkillCombatMeta from '$lib/components/SkillCombatMeta.svelte';
  import SkillEffectTag from '$lib/components/SkillEffectTag.svelte';
  import SkillExtraEffects from '$lib/components/SkillExtraEffects.svelte';
  import type { SkillVariant } from '$lib/domain/types';

  export let variant: SkillVariant;
  export let selectedLevel: number;
  export let showLevel = false;
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects:
    ((trigger: HTMLButtonElement, level: number) => void) | undefined = undefined;

  $: selected = variant.levels.find((level) => level.level === selectedLevel) ?? variant.levels[0];
  $: openSpecialEffectsFromDescription = onOpenSpecialEffects
    ? (trigger: HTMLButtonElement) =>
        onOpenSpecialEffects?.(trigger, selected?.level ?? selectedLevel)
    : undefined;
</script>

<section class="skill-variant" data-skill-id={variant.id}>
  <slot name="prefix" />
  <div class="skill-variant__heading">
    <h4><GameText text={variant.name} /></h4>
    <div class="skill-variant__heading-meta">
      <SkillEffectTag effect={variant.combatMeta.effect} />
      {#if showLevel}<span>Lv.{selected?.level ?? selectedLevel}</span>{/if}
    </div>
  </div>
  <SkillCombatMeta meta={variant.combatMeta} />
  {#if selected?.descriptionTokens.length}<p class="levelled-description">
      <DescriptionText
        tokens={selected.descriptionTokens}
        {specialEffectsAvailable}
        {specialEffectIconUrl}
        onOpenSpecialEffects={openSpecialEffectsFromDescription}
      />
    </p>{:else}<p class="data-placeholder">上游原始数据未提供该技能描述。</p>{/if}
  <SkillExtraEffects effects={variant.combatMeta.extraEffects ?? []} />
</section>
