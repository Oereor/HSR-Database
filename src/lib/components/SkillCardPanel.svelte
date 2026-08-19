<script lang="ts">
  import SkillProgressionPanel from '$lib/components/SkillProgressionPanel.svelte';
  import SkillExtraEffects from '$lib/components/SkillExtraEffects.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import SkillCombatMeta from '$lib/components/SkillCombatMeta.svelte';
  import SkillEffectTag from '$lib/components/SkillEffectTag.svelte';
  import type { SkillCard, SkillVariant } from '$lib/domain/types';

  export let card: SkillCard;

  $: fixedVariants = card.variants.filter((variant) => !variant.progressionId);
  const fixedLevel = (variant: SkillVariant) => variant.levels[0];
</script>

<article class="info-card skill-card" data-skill-category={card.category}>
  <div class="info-card__heading skill-card__heading">
    <h3>{card.displayLabel}</h3>
    <span>{card.variants.length} 个重载</span>
  </div>
  {#each card.progressions as progression (progression.id)}
    <SkillProgressionPanel
      {progression}
      variants={card.variants.filter((variant) => progression.variantIds.includes(variant.id))}
      categoryLabel={card.displayLabel}
      showGroupLabel={card.progressions.length > 1}
    />
  {/each}
  {#if fixedVariants.length}<div class="skill-variant-list fixed-variant-list">
      {#each fixedVariants as variant (variant.id)}
        <section class="skill-variant" data-skill-id={variant.id}>
          <div class="skill-variant__heading">
            <h4><GameText text={variant.name} /></h4>
            <div class="skill-variant__heading-meta">
              <SkillEffectTag effect={variant.combatMeta.effect} />
              <span>Lv.{fixedLevel(variant)?.level ?? 1}</span>
            </div>
          </div>
          <SkillCombatMeta meta={variant.combatMeta} />
          {#if fixedLevel(variant)?.descriptionTokens.length}<p class="levelled-description">
              {#each fixedLevel(variant).descriptionTokens as token}<span
                  class:scaling-value={token.type === 'scaling-value'}>{token.value}</span
                >{/each}
            </p>{:else}<p class="data-placeholder">上游原始数据未提供该技能描述。</p>{/if}
          <SkillExtraEffects effects={variant.combatMeta.extraEffects ?? []} />
        </section>
      {/each}
    </div>{/if}
</article>
