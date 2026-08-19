<script lang="ts">
  import type { SkillProgression, SkillVariant } from '$lib/domain/types';
  import GameText from '$lib/components/GameText.svelte';
  import SkillCombatMeta from '$lib/components/SkillCombatMeta.svelte';
  import SkillExtraEffects from '$lib/components/SkillExtraEffects.svelte';
  import SkillEffectTag from '$lib/components/SkillEffectTag.svelte';
  import { gameTextToPlain } from '$lib/domain/game-text';

  export let progression: SkillProgression;
  export let variants: SkillVariant[];
  export let categoryLabel: string;
  export let showGroupLabel = false;

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
      {@const selected =
        variant.levels.find((level) => level.level === selectedLevel) ?? variant.levels[0]}
      <section class="skill-variant" data-skill-id={variant.id}>
        <div class="skill-variant__heading">
          <h4><GameText text={variant.name} /></h4>
          <SkillEffectTag effect={variant.combatMeta.effect} />
        </div>
        <SkillCombatMeta meta={variant.combatMeta} />
        {#if selected?.descriptionTokens.length}<p class="levelled-description">
            {#each selected.descriptionTokens as token}<span
                class:scaling-value={token.type === 'scaling-value'}>{token.value}</span
              >{/each}
          </p>{:else}<p class="data-placeholder">上游原始数据未提供该技能描述。</p>{/if}
        <SkillExtraEffects effects={variant.combatMeta.extraEffects ?? []} />
      </section>
    {/each}
  </div>
</div>
