<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import SkillEffectTag from '$lib/components/SkillEffectTag.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import type { EnemySkill } from '$lib/domain/types';

  export let skill: EnemySkill;
  $: showPhases = skill.phases.length > 1;
</script>

<article class="enemy-skill-card" data-enemy-skill={skill.id}>
  <header class="enemy-skill-card__heading">
    <div>
      <h3><GameText text={skill.name} /></h3>
      {#if skill.kind === 'talent'}<span class="enemy-skill-kind">天赋</span>{/if}
    </div>
    <SkillEffectTag effect={skill.tag} />
  </header>
  {#if skill.damageType || showPhases}
    <div class="enemy-skill-meta">
      {#if skill.damageType}<SemanticIconLabel
          kind="element"
          code={skill.damageType.element}
          label={skill.damageType.name}
          color={getElementColor(skill.damageType.element)}
        />{/if}
      {#if showPhases}<span class="enemy-skill-phases">适用阶段 {skill.phases.join(' / ')}</span
        >{/if}
    </div>
  {/if}
  <p class:muted={!skill.description}><GameText text={skill.description || '资料未提供'} /></p>
  {#if skill.extraEffects.length}
    <details class="enemy-extra-effects">
      <summary>效果说明</summary>
      <div class="enemy-extra-effects__body">
        {#each skill.extraEffects as effect (effect.id)}
          <section data-extra-effect={effect.id}>
            <h4><GameText text={effect.name} /></h4>
            <p><GameText text={effect.description || '资料未提供'} /></p>
          </section>
        {/each}
      </div>
    </details>
  {/if}
</article>
