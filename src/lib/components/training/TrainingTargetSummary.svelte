<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import type { TrainingLevelControl, TrainingSkillTarget } from '$lib/domain/training/detail-view';
  import { m } from '$lib/paraglide/messages.js';

  export let levelControl: TrainingLevelControl | undefined = undefined;
  export let skills: TrainingSkillTarget[] = [];
  export let onLevelChange: ((level: number) => void) | undefined = undefined;
  export let onSkillTrainingLevelChange: ((key: string, level: number) => void) | undefined =
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
        {@const index = skill.availableLevels.indexOf(skill.trainingLevel)}
        {@const label = skill.jointLabel
          ? m.training_talent_assist_level()
          : m.skill_level({ category: skill.categoryLabel })}
        <div
          class="training-target__skill"
          data-training-skill={skill.key}
          data-training-key={skill.key}
          data-training-level={skill.trainingLevel}
        >
          <AssetImage
            src={getCharacterDetailIconUrl(skill.iconKey)}
            alt=""
            width={32}
            height={32}
            fallbackClass="training-target__icon-fallback"
          />
          <div class="training-target__skill-control">
            <LevelSlider
              id={`training-skill-${skill.key.replaceAll(':', '-')}`}
              label={skill.variantLabel ? `${label} · ${skill.variantLabel}` : label}
              value={index}
              min={0}
              max={skill.availableLevels.length - 1}
              displayValue={skill.trainingLevel}
              ariaValueMin={skill.availableLevels[0]}
              ariaValueMax={skill.availableLevels.at(-1) ?? skill.availableLevels[0]}
              interactive={!!onSkillTrainingLevelChange}
              onValueChange={(nextIndex) =>
                onSkillTrainingLevelChange?.(skill.key, skill.availableLevels[nextIndex])}
            />
          </div>
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
    row-gap: var(--space-4);
    margin-top: var(--space-4);
  }
  .training-target__skill {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }
  .training-target__skill-control {
    flex: 1;
    min-width: 0;
  }
  .training-target__skill > :global(img),
  .training-target__skill > :global(.training-target__icon-fallback) {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
  }
  @media (max-width: 640px) {
    .training-target__skills {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .training-target :global(.skill-level-control) {
    border-top: 0;
    padding-top: 0;
    margin-top: 0;
  }
  .training-target :global(.skill-level-control > div:first-child) {
    flex-wrap: wrap;
  }
  .training-target :global(.skill-level-control__value) {
    flex-wrap: wrap;
    max-width: 100%;
  }
</style>
