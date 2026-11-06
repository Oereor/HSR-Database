<script lang="ts">
  export let characterAccent: string | undefined = undefined;
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import { Badge } from '$lib/components/ui/badge';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SkillCombatMeta from '$lib/components/character/SkillCombatMeta.svelte';
  import SkillEffectTag from '$lib/components/shared/SkillEffectTag.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import type { SkillVariant } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';

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
    <AssetImage
      src={getCharacterDetailIconUrl(variant.iconKey)}
      alt=""
      class="size-10 shrink-0 object-contain"
      fallbackClass="size-10 shrink-0"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <h4><GameText text={variant.name} /></h4>

      <div class="skill-variant__heading-meta flex-wrap">
        <SkillEffectTag effect={variant.combatMeta.effect} />
        {#if variant.source === 'avatar-global-buff'}
          <Badge variant="outline" class="skill-effect-tag text-primary"
            >{m.skill_exclusive()}</Badge
          >
        {:else if showLevel}<span>Lv.{selected?.level ?? selectedLevel}</span>{/if}
      </div>
    </div>
  </div>
  <SkillCombatMeta meta={variant.combatMeta} {characterAccent} />
  {#if selected?.descriptionTokens.length}<p class="levelled-description">
      <DescriptionText
        tokens={selected.descriptionTokens}
        {characterAccent}
        {specialEffectsAvailable}
        {specialEffectIconUrl}
        onOpenSpecialEffects={openSpecialEffectsFromDescription}
      />
    </p>{:else}<p class="data-placeholder">{m.skill_description_unavailable()}</p>{/if}
  <SkillExtraEffects effects={variant.combatMeta.extraEffects ?? []} />
</section>
