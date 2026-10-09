<script lang="ts">
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import TrainingTargetSummary from './TrainingTargetSummary.svelte';
  import TrainingTraceSummary from './TrainingTraceSummary.svelte';
  import TrainingExpenseGroup from './TrainingExpenseGroup.svelte';
  import {
    createTrainingExpenseCosts,
    type TrainingLevelControl,
    type TrainingSkillTarget
  } from '$lib/domain/training/detail-view';
  import type {
    CharacterTrainingResult,
    LightConeTrainingResult,
    MaterialCatalog
  } from '$lib/domain/training/types';
  import type { Trace } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';

  export let result: CharacterTrainingResult | LightConeTrainingResult | undefined = undefined;
  export let catalog: MaterialCatalog | undefined = undefined;
  export let state: 'loading' | 'ready' | 'error';
  export let errorCode: string | undefined = undefined;
  export let onRetry: () => void;
  export let levelControl: TrainingLevelControl | undefined = undefined;
  export let skillTargets: TrainingSkillTarget[] = [];
  export let activeTraces: Trace[] = [];
  export let onLevelChange: ((level: number) => void) | undefined = undefined;
  export let onSkillDisplayLevelChange: ((pointId: string, level: number) => void) | undefined =
    undefined;
  $: number = new Intl.NumberFormat(catalog?.locale ?? getLocale());
  $: character = result && 'skills' in result ? result : undefined;
  $: expenses = result ? createTrainingExpenseCosts(result) : undefined;
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
  {:else if result && catalog && expenses}
    <div
      class="info-card training-result"
      data-training-promotion={result.target.promotion}
      data-training-level={result.target.level}
    >
      <TrainingTargetSummary
        {levelControl}
        skills={skillTargets}
        {onLevelChange}
        {onSkillDisplayLevelChange}
      >
        {#if character}<TrainingTraceSummary traces={activeTraces} />{/if}
      </TrainingTargetSummary>
      <TrainingExpenseGroup
        kind="upgrade"
        title={m.training_upgrade_cost()}
        cost={expenses.upgrade}
        {catalog}
      >
        <div
          slot="summary"
          data-required-exp={result.requiredExp}
          data-supplied-exp={result.suppliedExp}
          data-overflow-exp={result.overflowExp}
          data-exp-credits={result.expCreditCost['2'] ?? 0}
        >
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
          </dl>
        </div>
        <p class="muted training-strategy">{m.training_strategy_note()}</p>
      </TrainingExpenseGroup>
      <TrainingExpenseGroup
        kind="promotion"
        title={m.training_promotion_cost()}
        cost={expenses.promotion}
        {catalog}
      />
      {#if character && expenses.skillTrace}<TrainingExpenseGroup
          kind="skill-trace"
          title={m.training_skill_trace_cost()}
          cost={expenses.skillTrace}
          {catalog}
        />{/if}
      <TrainingExpenseGroup
        kind="total"
        title={m.training_total_materials()}
        cost={expenses.total}
        {catalog}
      />
    </div>
  {/if}
</section>

<style>
  .training-result {
    display: grid;
    gap: var(--space-6);
  }
  .training-exp-summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
    margin: 0 0 var(--space-4);
  }
  .training-exp-summary > div {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .training-exp-summary,
  .training-strategy {
    font-size: 0.8125rem;
  }
  .training-strategy {
    margin: var(--space-3) 0 0;
  }
  .training-error button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
</style>
