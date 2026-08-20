<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SkillExtraEffects from '$lib/components/SkillExtraEffects.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import SkillEffectTag from '$lib/components/SkillEffectTag.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { enemySkillAnchorId } from '$lib/domain/enemy-view';
  import type { EnemySkill } from '$lib/domain/types';

  export let skill: EnemySkill;
</script>

<article id={enemySkillAnchorId(skill.id)} class="enemy-skill-card" data-enemy-skill={skill.id}>
  <header class="enemy-skill-card__heading">
    <h3><GameText text={skill.name} /></h3>
    <SkillEffectTag effect={skill.tag} />
  </header>
  {#if skill.damageType}
    <div class="enemy-skill-meta">
      {#if skill.damageType}<SemanticIconLabel
          kind="element"
          code={skill.damageType.element}
          label={skill.damageType.name}
          color={getElementColor(skill.damageType.element)}
        />{/if}
    </div>
  {/if}
  <p class:muted={!skill.description}><GameText text={skill.description} /></p>
  <SkillExtraEffects effects={skill.extraEffects} />
</article>
