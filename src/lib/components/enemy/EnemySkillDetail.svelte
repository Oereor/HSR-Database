<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import SkillEffectTag from '$lib/components/shared/SkillEffectTag.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import {
    formatEnemySkillPercent,
    formatEnemySkillMultipliers,
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

  const attackRatio = (multipliers: readonly string[]): string =>
    m.enemy_skill_attack_ratio({ percent: formatEnemySkillMultipliers(multipliers) });

  $: facts = skill.detail;
  $: displayedApplications = visibleEnemySkillApplications(facts?.applications ?? []);
  $: shiftKinds = [...new Set(facts?.actionShifts?.map((shift) => shift.kind) ?? [])];
  $: hasFacts = !!(
    facts?.damage?.length ||
    displayedApplications.length ||
    facts?.actionShifts?.length
  );
</script>

<article class="enemy-skill-detail" data-enemy-skill-detail={skill.id}>
  <header class="enemy-skill-detail__heading">
    <h3><GameText text={skill.name} /></h3>
    {#if skill.damageType || skill.tag}
      <div class="enemy-skill-detail__metadata">
        {#if skill.damageType}
          <SemanticIconLabel
            kind="element"
            code={skill.damageType.element}
            label={skill.damageType.name}
            color={getElementColor(skill.damageType.element)}
          />
        {/if}
        <SkillEffectTag effect={skill.tag} />
      </div>
    {/if}
  </header>
  <p class:muted={!skill.description} class="enemy-skill-detail__description">
    <GameText text={skill.description} />
  </p>
  <SkillExtraEffects effects={skill.extraEffects} />

  {#if hasFacts}
    <div class="enemy-skill-detail__facts" data-enemy-skill-facts>
      <h4>{m.enemy_skill_numeric_information()}</h4>
      {#if facts?.damage?.length}<section class="enemy-skill-fact-section" data-enemy-skill-damage>
          <h5>{m.enemy_skill_damage_multiplier()}</h5>
          <div class="enemy-skill-fact-grid">
            {#each facts.damage as damage (damage.target ?? 'unlabelled')}
              <div class="enemy-skill-fact-row" data-damage-target={damage.target}>
                {#if damage.target}<span>{targetLabel(damage.target)}</span>{/if}
                <strong class:enemy-skill-fact-value--unlabelled={!damage.target}
                  >{attackRatio(damage.multipliers)}</strong
                >
              </div>
            {/each}
          </div>
        </section>{/if}

      {#if displayedApplications.length}<section
          class="enemy-skill-fact-section"
          data-enemy-skill-applications
        >
          <h5>{m.enemy_skill_base_chance()}</h5>
          <div class="enemy-skill-fact-grid">
            {#each displayedApplications as application, index (index)}
              <div class="enemy-skill-application" data-status-id={application.statusId}>
                {#if application.name}<div class="enemy-skill-application__name">
                    <GameText text={application.name} />
                  </div>{/if}
                <div class="enemy-skill-fact-row" data-base-chance>
                  {#if application.target}<span>{targetLabel(application.target)}</span>{/if}
                  <strong class:enemy-skill-fact-value--unlabelled={!application.target}
                    >{formatEnemySkillPercent(application.baseChance)}</strong
                  >
                </div>
              </div>
            {/each}
          </div>
        </section>{/if}

      {#each shiftKinds as kind (kind)}<section
          class="enemy-skill-fact-section"
          data-enemy-skill-action-shifts
        >
          <h5>
            {kind === 'advance' ? m.enemy_skill_action_advance() : m.enemy_skill_action_delay()}
          </h5>
          <div class="enemy-skill-fact-grid">
            {#each facts?.actionShifts?.filter((shift) => shift.kind === kind) ?? [] as shift, index (index)}
              <div class="enemy-skill-fact-row" data-action-shift={shift.kind}>
                <strong class="enemy-skill-fact-value--unlabelled"
                  >{formatEnemySkillPercent(shift.ratio)}</strong
                >
              </div>
            {/each}
          </div>
        </section>{/each}
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
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3) var(--space-4);
  }
  .enemy-skill-detail h3 {
    min-width: 0;
    flex: 1 1 12rem;
    margin: 0;
    font-size: var(--font-major-title);
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .enemy-skill-detail__metadata {
    display: flex;
    min-width: 0;
    max-width: 100%;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2) var(--space-3);
    margin-left: auto;
    overflow-wrap: anywhere;
  }
  .enemy-skill-detail__metadata :global(.semantic-icon-label) {
    min-width: 0;
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
  .enemy-skill-detail__facts > h4 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-major-title);
    font-weight: 700;
  }
  .enemy-skill-fact-section h5 {
    margin: 0 0 var(--space-2);
    color: var(--text-body);
    font-size: var(--font-meta-value);
    font-weight: 600;
  }
  .enemy-skill-fact-grid {
    display: grid;
    width: min(100%, 34rem);
    grid-template-columns: fit-content(10rem) minmax(0, 1fr);
    gap: var(--space-2) var(--space-4);
  }
  .enemy-skill-fact-row {
    display: grid;
    min-width: 0;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: baseline;
    row-gap: var(--space-2);
    color: var(--text-secondary);
  }
  .enemy-skill-fact-row > span,
  .enemy-skill-fact-row > strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .enemy-skill-fact-row strong {
    color: var(--text-primary);
    font-weight: 600;
    text-align: left;
  }
  .enemy-skill-fact-value--unlabelled {
    grid-column: 1 / -1;
  }
  .enemy-skill-application {
    display: grid;
    min-width: 0;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    row-gap: var(--space-2);
  }
  .enemy-skill-application__name {
    grid-column: 1 / -1;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }
  @media (max-width: 520px) {
    .enemy-skill-detail {
      padding: var(--space-4);
    }
    .enemy-skill-fact-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
