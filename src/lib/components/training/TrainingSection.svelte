<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import TrainingTargetSummary from './TrainingTargetSummary.svelte';
  import TrainingSkillTree from './TrainingSkillTree.svelte';
  import TrainingExpenseGroup from './TrainingExpenseGroup.svelte';
  import {
    createTrainingExpenseCosts,
    type TrainingLevelControl,
    type TrainingSkillTarget
  } from '$lib/domain/training/detail-view';
  import type {
    CharacterTrainingResult,
    CharacterTrainingProfile,
    LightConeTrainingResult,
    MaterialCatalog
  } from '$lib/domain/training/types';
  import type { CharacterProfile } from '$lib/domain/types';
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
  export let skillTree:
    | {
        path: string;
        profile: CharacterTrainingProfile;
        presentation: CharacterProfile;
        accent: string;
        onToggle: (pointId: string) => void;
      }
    | undefined = undefined;
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
    <Card.Root
      class="training-result bg-card grid gap-6 p-4 shadow-none"
      data-training-promotion={result.target.promotion}
      data-training-level={result.target.level}
    >
      {#if character}
        <TrainingTargetSummary
          {levelControl}
          skills={skillTargets}
          showTree={!!skillTree}
          {onLevelChange}
          {onSkillTrainingLevelChange}
        >
          {#if skillTree}
            <TrainingSkillTree
              path={skillTree.path}
              profile={skillTree.profile}
              presentation={skillTree.presentation}
              accent={skillTree.accent}
              state={{
                mode: 'interactive',
                activeTraceIds: character.target.activeTraceIds,
                onToggle: skillTree.onToggle
              }}
            />
          {/if}
        </TrainingTargetSummary>
      {/if}
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
    </Card.Root>
  {/if}
</section>

<style>
  :global(.training-result h3) {
    margin-bottom: 0.6rem;
    font-size: var(--font-major-title);
    font-weight: 700;
  }
  :global(.training-result small) {
    color: var(--gold);
    font-size: var(--font-helper);
  }
  :global(.training-result p) {
    margin-bottom: 0.5rem;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.7;
    white-space: pre-line;
  }
  .training-error button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
  }
</style>
