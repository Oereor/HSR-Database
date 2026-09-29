<script lang="ts">
  import CompactEntityCard from '$lib/components/shared/CompactEntityCard.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import SkillEffectTag from '$lib/components/shared/SkillEffectTag.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import EnemyWeaknessGroup from './EnemyWeaknessGroup.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { getEnemyRankLabel } from '$lib/domain/enemy-overview';
  import { formatEnemySkillPercent } from '$lib/domain/enemy-skill-format';
  import type { EnemySkillTarget } from '$lib/domain/types';
  import type { EnemySkillView } from '$lib/domain/enemy-view';
  import * as m from '$lib/paraglide/messages.js';

  export let skill: EnemySkillView;

  const targetLabel = (target: EnemySkillTarget | 'self'): string => {
    switch (target) {
      case 'primary':
        return m.enemy_skill_target_primary();
      case 'adjacent':
        return m.enemy_skill_target_adjacent();
      case 'all':
        return m.enemy_skill_target_all();
      case 'each-swept':
        return m.enemy_skill_target_each_swept();
      case 'enemy-ally':
        return m.enemy_skill_target_enemy_ally();
      case 'marked':
        return m.enemy_skill_target_marked();
      case 'other-marked':
        return m.enemy_skill_target_other_marked();
      case 'self':
        return m.enemy_skill_target_self();
    }
  };

  const statusKindLabel = (kind: 'Buff' | 'Debuff' | 'Other'): string => {
    switch (kind) {
      case 'Buff':
        return m.enemy_skill_status_buff();
      case 'Debuff':
        return m.enemy_skill_status_debuff();
      case 'Other':
        return m.enemy_skill_status_other();
    }
  };

  const attackRatio = (ratio: string): string =>
    m.enemy_skill_attack_ratio({ percent: formatEnemySkillPercent(ratio) });

  $: facts = skill.detail;
  $: hasFacts = !!(
    facts?.damage?.length ||
    facts?.bounce ||
    facts?.statuses?.length ||
    facts?.actionShifts?.length ||
    facts?.effects?.length ||
    facts?.summons?.length
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
              <strong>{attackRatio(damage.ratio)}</strong>
            </div>
          {/each}
        </section>{/if}

      {#if facts?.bounce}<section class="enemy-skill-fact-section" data-enemy-skill-bounce>
          <div class="enemy-skill-fact-row">
            <h4>{m.enemy_skill_bounce_count()}</h4>
            <strong>{facts.bounce.count}</strong>
          </div>
        </section>{/if}

      {#if facts?.statuses?.length}<section
          class="enemy-skill-fact-section"
          data-enemy-skill-statuses
        >
          <h4>{m.enemy_skill_status()}</h4>
          {#each facts.statuses as status (status.statusId)}
            <div class="enemy-skill-status" data-status-id={status.statusId}>
              <div class="enemy-skill-status__identity">
                <strong><GameText text={status.name} /></strong>
                <span class="enemy-skill-status__kind">{statusKindLabel(status.kind)}</span>
              </div>
              <div class="enemy-skill-fact-row">
                <span>{m.enemy_skill_target()}</span><span>{targetLabel(status.target)}</span>
              </div>
              {#if status.baseChance}<div class="enemy-skill-fact-row" data-base-chance>
                  <span>{m.enemy_skill_base_chance()}</span><strong
                    >{formatEnemySkillPercent(status.baseChance)}</strong
                  >
                </div>{/if}
              {#if status.duration?.kind === 'turns'}<div
                  class="enemy-skill-fact-row"
                  data-status-duration
                >
                  <span>{m.enemy_skill_duration()}</span><strong
                    >{status.duration.value === 1
                      ? m.enemy_skill_turn_one({ count: status.duration.value })
                      : m.enemy_skill_turn_other({ count: status.duration.value })}</strong
                  >
                </div>{/if}
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

      {#if facts?.effects?.length}<section
          class="enemy-skill-fact-section"
          data-enemy-skill-effects
        >
          <h4>{m.enemy_skill_effect()}</h4>
          {#each facts.effects as effect, index (index)}<p
              class="enemy-skill-effect"
              data-dot-effect={effect.kind}
            >
              {effect.kind === 'trigger-dot'
                ? m.enemy_skill_trigger_dot()
                : m.enemy_skill_clear_dot()}
            </p>{/each}
        </section>{/if}

      {#if facts?.summons?.length}<section
          class="enemy-skill-fact-section"
          data-enemy-skill-summons
        >
          <h4>{m.enemy_skill_possible_summons()}</h4>
          <div class="enemy-skill-summon-list">
            {#each facts.summons as summon (summon.monsterId)}<CompactEntityCard
                href={summon.href}
                imageUrl={summon.portraitUrl}
                data-skill-summon-monster={summon.monsterId}
              >
                <svelte:fragment slot="title"><GameText text={summon.name} /></svelte:fragment>
                <svelte:fragment slot="secondary">{getEnemyRankLabel(summon.rank)}</svelte:fragment>
                <svelte:fragment slot="tertiary">
                  <EnemyWeaknessGroup weaknesses={summon.weaknesses} />
                </svelte:fragment>
              </CompactEntityCard>{/each}
          </div>
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
  .enemy-skill-status + .enemy-skill-status {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }
  .enemy-skill-status__identity {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    overflow-wrap: anywhere;
  }
  .enemy-skill-status__kind {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 0.1rem 0.4rem;
    color: var(--text-secondary);
    font-size: var(--font-meta-value);
  }
  .enemy-skill-effect {
    margin: 0.25rem 0;
  }
  .enemy-skill-summon-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: var(--space-3);
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
