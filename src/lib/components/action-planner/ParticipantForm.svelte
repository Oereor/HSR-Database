<script lang="ts">
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import type { ActorDefinition, EventAnchor } from '$lib/action-planner/types';
  import {
    participantDraft,
    buildParticipantOperation,
    type SpawnOperation,
    type ParticipantField
  } from '$lib/action-planner/participant-config';
  export let locale: Locale;
  export let anchor: EventAnchor;
  export let editingId: string | undefined = undefined;
  export let onSave: (operation: SpawnOperation) => void;
  export let nextId: () => string;
  let draft = participantDraft();
  let original: SpawnOperation | undefined;
  let opened = true;
  let errors: Partial<Record<ParticipantField, string>> = {};
  let heading: HTMLHeadingElement;
  let addButton: HTMLButtonElement;
  const categories: NonNullable<ActorDefinition['category']>[] = [
    'character',
    'custom',
    'summon',
    'memosprite',
    'enemy'
  ];
  function categoryLabel(category: NonNullable<ActorDefinition['category']>) {
    switch (category) {
      case 'character':
        return m.planner_category_character({}, { locale });
      case 'custom':
        return m.planner_category_custom({}, { locale });
      case 'summon':
        return m.planner_category_summon({}, { locale });
      case 'memosprite':
        return m.planner_category_memosprite({}, { locale });
      case 'enemy':
        return m.planner_category_enemy({}, { locale });
    }
  }
  async function focusForm() {
    await tick();
    heading?.focus();
  }
  function beginAdd() {
    original = undefined;
    editingId = undefined;
    draft = participantDraft();
    errors = {};
    opened = true;
    void focusForm();
  }
  export function edit(operation: SpawnOperation) {
    original = operation;
    editingId = operation.id;
    draft = participantDraft(operation);
    errors = {};
    opened = true;
    void focusForm();
  }
  export async function cancel() {
    original = undefined;
    editingId = undefined;
    draft = participantDraft();
    errors = {};
    opened = false;
    await tick();
    addButton?.focus();
  }
  async function submit() {
    const result = buildParticipantOperation(draft, editingId ?? nextId(), anchor, original);
    errors = {};
    for (const field of result.invalid)
      errors[field] =
        field === 'name'
          ? m.planner_name_invalid({}, { locale })
          : field === 'actionLimit'
            ? m.planner_action_limit_invalid({}, { locale })
            : field === 'form'
              ? m.planner_form_invalid({}, { locale })
              : m.planner_speed_invalid({}, { locale });
    if (!result.operation) return;
    onSave(result.operation);
    await cancel();
  }
</script>

{#if !opened}
  <button
    bind:this={addButton}
    type="button"
    class="add-trigger"
    data-testid="add-participant"
    on:click={beginAdd}>+ {m.planner_add_participant({}, { locale })}</button
  >
{:else}
  <form
    novalidate
    data-testid="participant-form"
    data-mode={editingId ? 'edit' : 'add'}
    on:submit|preventDefault={submit}
  >
    <h3 tabindex="-1" bind:this={heading}>
      {editingId
        ? m.planner_edit_participant({}, { locale })
        : m.planner_new_operation({}, { locale })}
    </h3>
    <fieldset>
      <legend>{m.planner_participant_type({}, { locale })}</legend>
      <div class="pills segmented">
        {#each ['actor', 'scheduledEvent'] as kind}
          <button
            type="button"
            disabled={!!editingId}
            aria-pressed={draft.kind === kind}
            data-testid="participant-kind"
            data-value={kind}
            on:click={() => {
              draft.kind = kind as typeof draft.kind;
              errors = {};
            }}
            >{kind === 'actor'
              ? m.planner_actor({}, { locale })
              : m.planner_scheduled_event({}, { locale })}</button
          >
        {/each}
      </div>
    </fieldset>
    {#if anchor.kind === 'action'}
      <fieldset>
        <legend>{m.planner_timing({}, { locale })}</legend>
        <div class="pills segmented">
          {#each ['preAction', 'postAction'] as phase}
            <button
              type="button"
              aria-pressed={draft.phase === phase}
              data-testid="participant-phase"
              data-value={phase}
              on:click={() => {
                draft.phase = phase as typeof draft.phase;
              }}
              >{phase === 'preAction'
                ? m.planner_pre_action({}, { locale })
                : m.planner_post_action({}, { locale })}</button
            >
          {/each}
        </div>
      </fieldset>
    {/if}
    <label
      >{m.planner_name({}, { locale })}<input
        type="text"
        bind:value={draft.name}
        required
        data-testid="participant-name"
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? 'participant-name-error' : undefined}
      /></label
    >
    {#if errors.name}<p class="error" role="alert" id="participant-name-error">
        {errors.name}
      </p>{/if}
    {#if draft.kind === 'actor'}
      <fieldset>
        <legend>{m.planner_camp({}, { locale })}</legend>
        <div class="pills">
          {#each ['ally', 'enemy'] as camp}
            <button
              type="button"
              aria-pressed={draft.camp === camp}
              data-testid="participant-camp"
              data-value={camp}
              on:click={() => {
                draft.camp = camp as typeof draft.camp;
              }}
              >{camp === 'ally'
                ? m.planner_camp_ally({}, { locale })
                : m.planner_camp_enemy({}, { locale })}</button
            >
          {/each}
        </div>
      </fieldset>
      <fieldset>
        <legend>{m.planner_category({}, { locale })}</legend>
        <div class="pills">
          {#each categories as category}
            <button
              type="button"
              aria-pressed={draft.category === category}
              data-testid="participant-category"
              data-value={category}
              on:click={() => {
                draft.category = draft.category === category ? '' : category;
              }}>{categoryLabel(category)}</button
            >
          {/each}
        </div>
      </fieldset>
      <div class="form-pair">
        <div>
          <label
            >{m.planner_base_speed({}, { locale })}<input
              type="number"
              min="0"
              step="any"
              bind:value={draft.baseSpeed}
              data-testid="participant-base-speed"
              aria-invalid={!!errors.baseSpeed}
              aria-describedby={errors.baseSpeed ? 'participant-base-speed-error' : undefined}
            /></label
          >{#if errors.baseSpeed}<p class="error" role="alert" id="participant-base-speed-error">
              {errors.baseSpeed}
            </p>{/if}
        </div>
        <div>
          <label
            >{m.planner_panel_speed({}, { locale })}<input
              type="number"
              min="0"
              step="any"
              bind:value={draft.panelSpeed}
              data-testid="participant-panel-speed"
              aria-invalid={!!errors.panelSpeed}
              aria-describedby={errors.panelSpeed ? 'participant-panel-speed-error' : undefined}
            /></label
          >{#if errors.panelSpeed}<p class="error" role="alert" id="participant-panel-speed-error">
              {errors.panelSpeed}
            </p>{/if}
        </div>
      </div>
      <label
        >{m.planner_action_limit({}, { locale })}<input
          type="text"
          inputmode="numeric"
          placeholder="∞"
          bind:value={draft.actionLimit}
          data-testid="participant-action-limit"
          aria-invalid={!!errors.actionLimit}
          aria-describedby={errors.actionLimit ? 'participant-action-limit-error' : undefined}
        /></label
      >
      {#if errors.actionLimit}<p class="error" role="alert" id="participant-action-limit-error">
          {errors.actionLimit}
        </p>{/if}
    {:else}
      <label
        >{m.planner_speed({}, { locale })}<input
          type="number"
          min="0"
          step="any"
          bind:value={draft.speed}
          data-testid="participant-speed"
          aria-invalid={!!errors.speed}
          aria-describedby={errors.speed ? 'participant-speed-error' : undefined}
        /></label
      >
      {#if errors.speed}<p class="error" role="alert" id="participant-speed-error">
          {errors.speed}
        </p>{/if}
    {/if}
    {#if errors.form}<p class="error" role="alert">{errors.form}</p>{/if}
    <div class="actions">
      <button type="submit" class="accent" data-testid="submit-participant"
        >{editingId
          ? m.planner_save_participant({}, { locale })
          : m.planner_add_participant({}, { locale })}</button
      >
      <button type="button" data-testid="cancel-participant" on:click={cancel}
        >{m.planner_cancel({}, { locale })}</button
      >
    </div>
  </form>
{/if}

<style>
  form {
    display: grid;
    gap: var(--space-3);
  }
  h3 {
    margin: 0;
    font-size: var(--font-body);
    font-weight: 650;
    color: var(--text-secondary);
  }
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend,
  label {
    color: var(--text-body);
    font-size: var(--font-helper);
  }
  legend {
    margin-bottom: var(--space-2);
  }
  label {
    display: grid;
    gap: var(--space-2);
  }
  button,
  input {
    min-width: 0;
    color: var(--text-primary);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    font: inherit;
    font-size: var(--font-helper);
    padding: var(--space-2) var(--space-3);
  }
  input {
    width: 100%;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:hover:not(:disabled) {
    border-color: var(--gold);
  }
  button:focus-visible,
  input:focus-visible,
  h3:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .accent {
    border-color: var(--gold);
    color: var(--gold-soft);
  }
  .pills,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .pills button {
    border-radius: 999px;
    background: transparent;
  }
  .pills button[aria-pressed='true'] {
    color: var(--text-primary);
    border-color: var(--text-secondary);
    background: var(--surface-2);
  }
  .segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 3px;
    gap: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
  }
  .segmented button {
    border: 0;
    border-radius: var(--radius-control);
    padding: var(--space-1) var(--space-2);
    color: var(--text-secondary);
  }
  .segmented button[aria-pressed='true'] {
    color: var(--text-primary);
    background: var(--surface-2);
  }
  .add-trigger {
    background: transparent;
    padding: var(--space-1) var(--space-3);
  }
  .form-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .error {
    color: #ffb4b4;
    font-size: var(--font-helper);
    margin: 0;
  }
  input[aria-invalid='true'] {
    border-color: #ffb4b4;
  }
  @media (max-width: 379px) {
    .form-pair {
      grid-template-columns: 1fr;
    }
  }
</style>
