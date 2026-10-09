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

  export let result: CharacterTrainingResult | LightConeTrainingResult | undefined = undefined;
  export let catalog: MaterialCatalog | undefined = undefined;
  export let state: 'loading' | 'ready' | 'error';
  export let errorCode: string | undefined = undefined;
  export let onRetry: () => void;
  export let onSelectMaterial: (itemId: string, trigger: HTMLButtonElement) => void = () =>
    undefined;
  export let levelControl: TrainingLevelControl | undefined = undefined;
  export let skillTargets: TrainingSkillTarget[] = [];
  export let activeTraces: Trace[] = [];
  export let onLevelChange: ((level: number) => void) | undefined = undefined;
  export let onSkillTrainingLevelChange: ((key: string, level: number) => void) | undefined =
    undefined;
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
        {onSkillTrainingLevelChange}
      >
        {#if character}<TrainingTraceSummary traces={activeTraces} />{/if}
      </TrainingTargetSummary>
      <TrainingExpenseGroup
        kind="upgrade"
        title={m.training_upgrade_cost()}
        cost={expenses.upgrade}
        {onSelectMaterial}
        {catalog}
      />
      <TrainingExpenseGroup
        kind="promotion"
        title={m.training_promotion_cost()}
        cost={expenses.promotion}
        {onSelectMaterial}
        {catalog}
      />
      {#if character && expenses.skillTrace}<TrainingExpenseGroup
          kind="skill-trace"
          title={m.training_skill_trace_cost()}
          cost={expenses.skillTrace}
          {onSelectMaterial}
          {catalog}
        />{/if}
      <TrainingExpenseGroup
        kind="total"
        title={m.training_total_materials()}
        cost={expenses.total}
        {onSelectMaterial}
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
  .training-error button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
</style>
