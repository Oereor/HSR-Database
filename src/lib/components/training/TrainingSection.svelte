<script lang="ts">
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import MaterialCostList from './MaterialCostList.svelte';
  import type {
    CharacterTrainingResult,
    LightConeTrainingResult,
    MaterialCatalog,
    CharacterTrainingProfile
  } from '$lib/domain/training/types';
  import type { SkillCard } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  export let result: CharacterTrainingResult | LightConeTrainingResult | undefined = undefined;
  export let catalog: MaterialCatalog | undefined = undefined;
  export let state: 'loading' | 'ready' | 'error';
  export let errorCode: string | undefined = undefined;
  export let onRetry: () => void;
  export let profile: CharacterTrainingProfile | undefined = undefined;
  export let cards: SkillCard[] = [];
  $: number = new Intl.NumberFormat(catalog?.locale ?? getLocale());
  $: character = result && 'skills' in result ? result : undefined;
  $: skills =
    character?.skills.map((skill) => {
      const categories = new Set(
        profile?.nodes
          .find((node) => node.key === skill.key)
          ?.bindings.map((binding) => binding.category)
      );
      const labels = cards
        .filter((card) => categories.has(card.category))
        .map((card) => card.displayLabel);
      return { ...skill, label: [...new Set(labels)].join(' / ') };
    }) ?? [];
</script>

<section
  id="training"
  class="detail-section section-nav-target"
  data-training-state={state}
  data-training-error={state === 'error' ? errorCode : undefined}
>
  <SectionHeading level={1}>{m.training_title()}</SectionHeading>
  {#if state === 'loading'}
    <p class="data-placeholder" role="status">{m.training_loading()}</p>
  {:else if state === 'error'}
    <div class="training-error" role="status">
      <p>
        {errorCode === 'non-integer-exp-credit'
          ? m.training_exp_credit_undetermined()
          : m.training_load_error()}
      </p>
      <button type="button" on:click={onRetry}>{m.training_retry()}</button>
    </div>
  {:else if result && catalog}
    <div
      class="info-card training-result"
      data-training-promotion={result.target.promotion}
      data-training-level={result.target.level}
    >
      <div class="training-target">
        <h3>{m.training_target()}</h3>
        <p>
          {m.training_target_level({
            level: result.target.level,
            promotion: result.target.promotion
          })}
        </p>
        {#if character}<ul class="training-skills">
            {#each skills as skill (skill.key)}<li
                data-training-skill={skill.key}
                data-display-level={skill.displayLevel}
                data-training-level={skill.trainingLevel}
              >
                {skill.label}：{#if skill.displayLevel !== skill.trainingLevel}{m.training_skill_clamped(
                    { display: skill.displayLevel, training: skill.trainingLevel }
                  )}{:else}Lv.{skill.trainingLevel}{/if}
              </li>{/each}
          </ul>
          <p data-training-trace-count={character.target.activeTraceIds.length}>
            {m.training_trace_count({ count: character.target.activeTraceIds.length })}
          </p>{/if}
      </div>
      <div
        class="training-exp"
        data-required-exp={result.requiredExp}
        data-supplied-exp={result.suppliedExp}
        data-overflow-exp={result.overflowExp}
      >
        <h3>{m.training_exp_materials()}</h3>
        <dl class="training-exp-summary">
          <div>
            <dt>{m.training_required_exp()}</dt>
            <dd>{number.format(result.requiredExp)}</dd>
          </div>
          <div>
            <dt>{m.training_supplied_exp()}</dt>
            <dd>{number.format(result.suppliedExp)}</dd>
          </div>
          {#if result.overflowExp}<div>
              <dt>{m.training_overflow_exp()}</dt>
              <dd>{number.format(result.overflowExp)}</dd>
            </div>{/if}
          <div>
            <dt>{m.training_exp_credits()}</dt>
            <dd data-exp-credits={result.expCreditCost['2'] ?? 0}>
              {number.format(result.expCreditCost['2'] ?? 0)}
            </dd>
          </div>
        </dl>
        <MaterialCostList cost={result.expItemCost} {catalog} />
        <p class="muted training-strategy">{m.training_strategy_note()}</p>
      </div>
      <div class="training-total">
        <h3>{m.training_total_materials()}</h3>
        <p class="training-credit-breakdown">
          {m.training_promotion_credits({
            count: number.format(result.promotionCost['2'] ?? 0)
          })}{#if character}<span
              >{m.training_skill_credits({
                count: number.format(result.skillCost['2'] ?? 0)
              })}</span
            ><span
              >{m.training_trace_credits({
                count: number.format(result.traceCost['2'] ?? 0)
              })}</span
            >{/if}
        </p>
        <MaterialCostList cost={result.totalCost} {catalog} />
      </div>
    </div>
  {/if}
</section>

<style>
  .training-result {
    display: grid;
    gap: var(--space-6);
  }
  .training-result > div + div {
    border-top: 1px solid var(--border);
    padding-top: var(--space-6);
  }
  h3 {
    margin: 0 0 var(--space-3);
  }
  p {
    margin: var(--space-3) 0;
  }
  .training-skills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
    list-style: none;
    padding: 0;
    margin: var(--space-3) 0;
    font-size: 0.875rem;
  }
  .training-exp-summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
    margin: 0 0 var(--space-4);
  }
  .training-exp-summary > div {
    display: flex;
    gap: var(--space-2);
  }
  dt,
  .training-credit-breakdown {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .training-strategy {
    font-size: 0.8125rem;
  }
  .training-credit-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .training-error button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
</style>
