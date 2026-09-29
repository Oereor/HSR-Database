<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import type { EnemySkillView } from '$lib/domain/enemy-view';

  export let skills: EnemySkillView[];
  export let selectedSkillId: string | undefined;
  export let onSelect: (skillId: string) => void;
</script>

<div class="enemy-skill-selector" data-enemy-skill-selector>
  {#each skills as skill (skill.id)}
    <button
      type="button"
      class="enemy-skill-selector__option"
      class:enemy-skill-selector__option--selected={skill.id === selectedSkillId}
      aria-pressed={skill.id === selectedSkillId}
      data-enemy-skill-option={skill.id}
      on:click={() => onSelect(skill.id)}
    >
      {#if skill.damageType}<span class="enemy-skill-selector__icon" aria-hidden="true"
          ><SemanticIconLabel
            kind="element"
            code={skill.damageType.element}
            label={skill.damageType.name}
            color={getElementColor(skill.damageType.element)}
            showLabel={false}
          /></span
        >{/if}
      <strong><GameText text={skill.name} /></strong>
    </button>
  {/each}
</div>

<style>
  .enemy-skill-selector {
    min-width: 0;
    align-self: start;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    overflow: hidden;
    background: rgb(14 20 34 / 48%);
  }
  .enemy-skill-selector__option {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: var(--space-3);
    border: 0;
    border-bottom: 1px solid var(--border);
    border-left: 3px solid transparent;
    background: transparent;
    padding: 0.8rem 0.9rem;
    color: var(--text-body);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .enemy-skill-selector__option:last-child {
    border-bottom: 0;
  }
  .enemy-skill-selector__option:hover {
    background: rgb(215 181 109 / 7%);
    color: var(--text-primary);
  }
  .enemy-skill-selector__option--selected,
  .enemy-skill-selector__option--selected:hover {
    border-left-color: var(--gold);
    background: rgb(215 181 109 / 12%);
    color: var(--text-primary);
  }
  .enemy-skill-selector__option:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: -4px;
  }
  .enemy-skill-selector__option strong {
    min-width: 0;
    font-size: var(--font-meta-value);
    overflow-wrap: anywhere;
  }
  .enemy-skill-selector__icon {
    --semantic-icon-image-size: 1.15rem;
    display: grid;
    flex: 0 0 1.3rem;
    place-items: center;
  }
</style>
