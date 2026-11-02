<script lang="ts">
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import type { EnemySkillView } from '$lib/domain/enemy-view';

  export let skills: EnemySkillView[];
  export let selectedSkillId: string | undefined;
  export let onSelect: (skillId: string) => void;
</script>

<ToggleGroup.Root
  type="single"
  value={selectedSkillId ?? ''}
  onValueChange={(value) => {
    if (value) onSelect(value);
  }}
  orientation="vertical"
  variant="outline"
  spacing={1}
  class="enemy-skill-selector w-full items-stretch"
  data-enemy-skill-selector
>
  {#each skills as skill (skill.id)}
    <ToggleGroup.Item
      value={skill.id}
      data-enemy-skill-option={skill.id}
      class="h-auto min-w-0 justify-start gap-3 px-3 py-3 text-left whitespace-normal"
      onclick={(event) => {
        if (skill.id === selectedSkillId) event.preventDefault();
      }}
    >
      <span
        class="enemy-skill-selector__icon grid w-[1.15rem] shrink-0 place-items-center [--semantic-icon-image-size:1.15rem]"
        aria-hidden="true"
      >
        {#if skill.damageType}<SemanticIconLabel
            kind="element"
            code={skill.damageType.element}
            label={skill.damageType.name}
            color={getElementColor(skill.damageType.element)}
            showLabel={false}
          />{/if}
      </span>
      <strong><GameText text={skill.name} /></strong>
    </ToggleGroup.Item>
  {/each}
</ToggleGroup.Root>
