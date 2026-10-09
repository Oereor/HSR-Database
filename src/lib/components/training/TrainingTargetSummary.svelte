<script lang="ts">
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import type { TrainingLevelControl, TrainingSkillTarget } from '$lib/domain/training/detail-view';
  import { m } from '$lib/paraglide/messages.js';

  export let levelControl: TrainingLevelControl | undefined = undefined;
  export let skills: TrainingSkillTarget[] = [];
  export let onLevelChange: ((level: number) => void) | undefined = undefined;
  export let onSkillDisplayLevelChange: ((pointId: string, level: number) => void) | undefined =
    undefined;
</script>

<div class="training-target" data-training-target>
  <SectionHeading level={2} headingLevel={3}>{m.training_target()}</SectionHeading>
  {#if levelControl}
    <LevelSlider
      id={levelControl.id}
      label={levelControl.label}
      value={levelControl.value}
      min={levelControl.min}
      max={levelControl.max}
      leadingTag={m.player_character_promotion({ promotion: levelControl.promotion })}
      interactive={!!onLevelChange}
      onValueChange={onLevelChange}
    />
  {/if}
  {#if skills.length}
    <div class="training-target__skills">
      {#each skills as skill (skill.key)}
        {@const index = skill.availableLevels.indexOf(skill.displayLevel)}
        {@const label = skill.jointLabel
          ? m.training_talent_assist_level()
          : m.skill_level({ category: skill.categoryLabel })}
        <div
          class="training-target__skill"
          data-training-skill={skill.key}
          data-training-key={skill.key}
          data-display-level={skill.displayLevel}
          data-training-level={skill.trainingLevel}
        >
          <LevelSlider
            id={`training-skill-${skill.key.replaceAll(':', '-')}`}
            label={skill.variantLabel ? `${label} · ${skill.variantLabel}` : label}
            value={index}
            min={0}
            max={skill.availableLevels.length - 1}
            displayValue={skill.displayLevel}
            ariaValueMin={skill.availableLevels[0]}
            ariaValueMax={skill.availableLevels.at(-1) ?? skill.availableLevels[0]}
            leadingTag={skill.requiredPromotion !== undefined
              ? m.training_skill_promotion_required({ promotion: skill.requiredPromotion })
              : undefined}
            interactive={!!onSkillDisplayLevelChange}
            onValueChange={(nextIndex) =>
              onSkillDisplayLevelChange?.(skill.pointId, skill.availableLevels[nextIndex])}
          />
          {#if skill.displayLevel !== skill.trainingLevel}
            <p class="muted training-target__clamp">
              {m.training_skill_clamped({
                display: skill.displayLevel,
                training: skill.trainingLevel
              })}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  <slot />
</div>

<style>
  .training-target__skills {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--space-6);
    row-gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .training-target__skill {
    min-width: 0;
  }
  .training-target__clamp {
    margin: var(--space-2) 0 0;
    font-size: var(--font-meta-key);
  }
  @media (max-width: 640px) {
    .training-target__skills {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .training-target :global(.skill-level-control > div:first-child) {
    flex-wrap: wrap;
  }
  .training-target :global(.skill-level-control__value) {
    flex-wrap: wrap;
    max-width: 100%;
  }
</style>
