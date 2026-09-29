<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import SkillEffectTag from '$lib/components/shared/SkillEffectTag.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import {
    formatEnemySkillPercent,
    formatEnemySkillTotals,
    visibleEnemySkillApplications
  } from '$lib/domain/enemy-skill-format';
  import type { EnemySkillDamageTarget } from '$lib/domain/types';
  import type { EnemySkillView } from '$lib/domain/enemy-view';
  import * as m from '$lib/paraglide/messages.js';

  export let skill: EnemySkillView;

  const targetLabel = (target: EnemySkillDamageTarget): string => {
    switch (target) {
      case 'primary':
        return m.enemy_skill_target_primary();
      case 'adjacent':
        return m.enemy_skill_target_adjacent();
      case 'all':
        return m.enemy_skill_target_all();
      case 'each-swept':
        return m.enemy_skill_target_each_swept();
      case 'enemy-side':
        return m.enemy_skill_target_enemy_side();
      case 'marked':
        return m.enemy_skill_target_marked();
      case 'other-marked':
        return m.enemy_skill_target_other_marked();
    }
  };

  const attackRatio = (totals: readonly string[]): string =>
    m.enemy_skill_attack_ratio({ percent: formatEnemySkillTotals(totals) });

  $: facts = skill.detail;
  $: displayedApplications = visibleEnemySkillApplications(facts?.applications ?? []);
  $: hasFacts = !!(
    facts?.damage?.length ||
    displayedApplications.length ||
    facts?.actionShifts?.length
  );
</script>

<article class="enemy-skill-detail" data-enemy-skill-detail={skill.id}>
  <header class="enemy-skill-detail__heading">
    <h3><GameText text={skill.name} /></h3>
    <SkillEffectTag effect={skill.tag} />
  </header>
  {#if skill.damageType}<div class="enemy-skill-detail__element">
      <SemanticIconLabel
        kind="element"
        code={skill.damageType.element}
        label={skill.damageType.name}
        color={getElementColor(skill.damageType.element)}
      />
    </div>{/if}
  <p class:muted={!skill.description} class="enemy-skill-detail__description">
    <GameText text={skill.description} />
  </p>
  <SkillExtraEffects effects={skill.extraEffects} />

  {#if hasFacts}
    <div class="enemy-skill-detail__facts" data-enemy-skill-facts>
      {#if facts?.damage?.length}<section class="enemy-skill-fact-section" data-enemy-skill-damage>
          <h4>{m.enemy_skill_damage_multiplier()}</h4>
          {#each facts.damage as damage (damage.target)}
            <div class="enemy-skill-fact-row" data-damage-target={damage.target}>
              <span>{targetLabel(damage.target)}</span>
              <strong>{attackRatio(damage.totals)}</strong>
            </div>
          {/each}
        </section>{/if}

      {#if displayedApplications.length}<section
          class="enemy-skill-fact-section"
          data-enemy-skill-applications
        >
          {#each displayedApplications as application, index (index)}
            <div class="enemy-skill-application" data-status-id={application.statusId}>
              {#if application.name}<strong class="enemy-skill-application__name"
                  ><GameText text={application.name} /></strong
                >{/if}
              <div class="enemy-skill-fact-row" data-base-chance>
                <span>
                  {m.enemy_skill_base_chance()}
                  {#if application.target}
                    · {targetLabel(application.target)}{/if}
                </span>
                <strong>{formatEnemySkillPercent(application.baseChance)}</strong>
              </div>
            </div>
          {/each}
        </section>{/if}

      {#if facts?.actionShifts?.length}<section
          class="enemy-skill-fact-section"
          data-enemy-skill-action-shifts
        >
          {#each facts.actionShifts as shift, index (index)}<div
              class="enemy-skill-fact-row"
              data-action-shift={shift.kind}
            >
              <h4>
                {shift.kind === 'advance'
                  ? m.enemy_skill_action_advance()
                  : m.enemy_skill_action_delay()}
              </h4>
              <strong>{formatEnemySkillPercent(shift.ratio)}</strong>
            </div>{/each}
        </section>{/if}
    </div>
  {/if}
</article>

<style>
  .enemy-skill-detail {
    min-width: 0;
    align-self: start;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: rgb(14 20 34 / 68%);
    padding: clamp(1rem, 2vw, 1.5rem);
  }
  .enemy-skill-detail__heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .enemy-skill-detail h3 {
    margin: 0;
    font-size: var(--font-major-title);
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .enemy-skill-detail__element {
    margin-top: var(--space-3);
  }
  .enemy-skill-detail__description {
    margin: 1rem 0 0;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.75;
  }
  .enemy-skill-detail__facts {
    display: grid;
    gap: var(--space-4);
    margin-top: var(--space-6);
    padding-top: var(--space-6);
    border-top: 1px solid var(--border);
  }
  .enemy-skill-fact-section + .enemy-skill-fact-section {
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  .enemy-skill-fact-section h4 {
    margin: 0 0 var(--space-2);
    color: var(--text-secondary);
    font-size: var(--font-meta-value);
  }
  .enemy-skill-fact-row {
    display: flex;
    min-width: 0;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    padding-block: 0.25rem;
    color: var(--text-secondary);
  }
  .enemy-skill-fact-row h4 {
    margin: 0;
  }
  .enemy-skill-fact-row strong {
    color: var(--text-primary);
    font-weight: 600;
    text-align: right;
  }
  .enemy-skill-application + .enemy-skill-application {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }
  .enemy-skill-application__name {
    display: block;
    margin-bottom: var(--space-2);
    overflow-wrap: anywhere;
  }
  @media (max-width: 520px) {
    .enemy-skill-detail {
      padding: var(--space-4);
    }
    .enemy-skill-detail__heading {
      flex-wrap: wrap;
      gap: 0.65rem;
    }
  }
</style>
