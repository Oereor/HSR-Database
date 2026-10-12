<script lang="ts">
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { previewOperationState, validateOperations } from '$lib/action-planner/engine';
  import { effectPhase, targetIds } from '$lib/action-planner/effect-config';
  import { canUseVonwacq, presetOperation, type PresetKind } from '$lib/action-planner/presets';
  import type {
    EffectOperation,
    EffectPhase,
    EventAnchor,
    SimulationState,
    TargetedOperation
  } from '$lib/action-planner/types';
  import {
    speedDurationDraft,
    parseSpeedDuration
  } from '$lib/action-planner/speed-duration-config';
  import type { ParticipantLabels } from '$lib/action-planner/presentation';
  import PresetSection from './PresetSection.svelte';
  import TargetGrid from './TargetGrid.svelte';
  import {
    operationTargets,
    selectableTargets,
    validTargetSelection
  } from '$lib/action-planner/targeting';

  export let locale: Locale;
  export let labels: ParticipantLabels = new Map();
  export let anchor: EventAnchor;
  export let operations: EffectOperation[];
  export let context: SimulationState | undefined = undefined;
  export let avatar: (id: string) => string | undefined;
  export let presets: { vonwacq?: string; eagle?: string; dance?: string };
  export let onSave: (operation: EffectOperation) => void;
  export let nextId: () => string;

  let opened = false;
  export let editingId: string | undefined = undefined;
  let type: TargetedOperation['type'] = 'advance';
  let phase: EffectPhase = 'preAction';
  let selectedIds: string[] = [];
  let percent: number | undefined = 50;
  let amount: number | undefined = 10;
  let durationDraft = speedDurationDraft();
  let mode: 'flat' | 'percent' = 'flat';
  let selectedPreset: PresetKind | undefined;
  let errors: Partial<
    Record<
      'target' | 'percent' | 'amount' | 'turns' | 'countdownName' | 'countdownSpeed' | 'form',
      string
    >
  > = {};
  let formHeading: HTMLHeadingElement;
  let addButton: HTMLButtonElement;

  $: preview = context
    ? previewOperationState(context, operations, anchor, phase, editingId)
    : undefined;
  $: units = operationTargets(preview);
  $: actorTargets = units.filter((participant) => participant.kind === 'actor');
  $: eligibleIds = new Set(
    selectableTargets(type, units, selectedIds).map((participant) => participant.id)
  );
  $: disabledIds = units
    .filter((participant) => !eligibleIds.has(participant.id))
    .map((participant) => participant.id);
  $: missingIds = selectedIds.filter((id) => !units.some((unit) => unit.id === id));

  function effectLabel(value: TargetedOperation['type']) {
    return value === 'advance'
      ? m.planner_advance({}, { locale })
      : value === 'delay'
        ? m.planner_delay({}, { locale })
        : value === 'immediatelyAct'
          ? m.planner_card_immediate({}, { locale })
          : m.planner_add_speed({}, { locale });
  }
  async function focusForm() {
    await tick();
    formHeading?.focus();
  }
  function resetDraft() {
    selectedPreset = undefined;
    editingId = undefined;
    type = 'advance';
    phase = 'preAction';
    selectedIds = units[0] ? [units[0].id] : [];
    percent = 50;
    amount = 10;
    durationDraft = speedDurationDraft();
    mode = 'flat';
    errors = {};
  }
  function beginAdd() {
    resetDraft();
    opened = true;
    void focusForm();
  }
  export async function cancel() {
    opened = false;
    resetDraft();
    await tick();
    addButton?.focus();
  }
  export function edit(op: EffectOperation) {
    if (op.type === 'spawnParticipant') return;
    selectedPreset = undefined;
    editingId = op.id;
    type = op.type;
    phase = effectPhase(op) ?? 'preAction';
    const before = context
      ? previewOperationState(context, operations, anchor, phase, op.id)
      : undefined;
    selectedIds = targetIds(op.target, operationTargets(before));
    percent = op.type === 'advance' || op.type === 'delay' ? op.percent : 50;
    amount = op.type === 'addSpeedModifier' ? op.amount : 10;
    durationDraft = speedDurationDraft(op.type === 'addSpeedModifier' ? op.duration : undefined);
    mode = op.type === 'addSpeedModifier' ? op.mode : 'flat';
    errors = {};
    opened = true;
    void focusForm();
  }
  function toggleTarget(id: string) {
    if (!selectedIds.includes(id) && !eligibleIds.has(id)) return;
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
    errors = { ...errors, target: undefined };
  }
  async function submit() {
    errors = {};
    if (
      !selectedIds.length ||
      missingIds.length ||
      !validTargetSelection(
        type,
        units.filter((participant) => selectedIds.includes(participant.id))
      )
    )
      errors.target = m.planner_target_invalid({}, { locale });
    if (
      (type === 'advance' || type === 'delay') &&
      (percent === undefined || !Number.isFinite(percent) || percent < 0)
    )
      errors.percent = m.planner_percent_invalid({}, { locale });
    if (type === 'addSpeedModifier' && (amount === undefined || !Number.isFinite(amount)))
      errors.amount = m.planner_amount_invalid({}, { locale });
    const parsedDuration =
      type === 'addSpeedModifier' ? parseSpeedDuration(durationDraft) : undefined;
    for (const field of parsedDuration?.invalid ?? [])
      errors[field] =
        field === 'turns'
          ? m.planner_turns_invalid({}, { locale })
          : field === 'countdownName'
            ? m.planner_name_invalid({}, { locale })
            : m.planner_speed_invalid({}, { locale });
    if (Object.values(errors).some(Boolean)) return;
    const base = {
      id: editingId ?? nextId(),
      target: { kind: 'participants' as const, participantIds: [...selectedIds] },
      ...(anchor.kind === 'action' ? { phase } : {})
    };
    const op: EffectOperation =
      type === 'immediatelyAct'
        ? { ...base, type }
        : type === 'addSpeedModifier'
          ? { ...base, type, mode, amount: amount!, duration: parsedDuration!.duration! }
          : { ...base, type, percent: percent! };
    if (validateOperations([op], anchor).length) {
      errors.form = m.planner_form_invalid({}, { locale });
      return;
    }
    onSave(op);
    await cancel();
  }
  function fillPreset(kind: PresetKind, presetTarget: string) {
    if (kind === 'vonwacq' && !canUseVonwacq(anchor)) return;
    const currentPhase = opened ? phase : 'preAction';
    edit({
      ...presetOperation(kind, '', presetTarget),
      ...(anchor.kind === 'action' ? { phase: currentPhase } : {})
    });
    editingId = undefined;
    phase = currentPhase;
    selectedPreset = kind;
  }
</script>

{#if !opened}
  <button
    bind:this={addButton}
    type="button"
    class="accent"
    data-testid="add-effect"
    on:click={beginAdd}>+ {m.planner_add_effect({}, { locale })}</button
  >
{/if}
{#if opened}
  <form
    novalidate
    on:submit|preventDefault={submit}
    data-testid="effect-form"
    data-mode={editingId ? 'edit' : 'add'}
  >
    <h3 bind:this={formHeading} tabindex="-1">
      {editingId
        ? m.planner_edit_effect_heading({}, { locale })
        : m.planner_new_effect_heading({}, { locale })}
    </h3>
    <fieldset>
      <legend>{m.planner_effect_type({}, { locale })}</legend>
      <div class="pills types">
        {#each ['advance', 'delay', 'immediatelyAct', 'addSpeedModifier'] as value}
          <button
            type="button"
            data-testid="effect-type"
            data-value={value}
            aria-pressed={type === value}
            on:click={() => {
              type = value as TargetedOperation['type'];
              errors = {};
            }}>{effectLabel(value as TargetedOperation['type'])}</button
          >
        {/each}
      </div>
    </fieldset>
    {#if anchor.kind === 'action'}
      <fieldset>
        <legend>{m.planner_timing({}, { locale })}</legend>
        <div class="pills segmented">
          {#each ['preAction', 'postAction'] as value}
            <button
              type="button"
              data-testid="effect-phase"
              data-value={value}
              aria-pressed={phase === value}
              on:click={() => {
                phase = value as EffectPhase;
              }}
              >{value === 'preAction'
                ? m.planner_pre_action({}, { locale })
                : m.planner_post_action({}, { locale })}</button
            >
          {/each}
        </div>
      </fieldset>
    {/if}
    <fieldset aria-describedby={errors.target ? 'effect-target-error' : undefined}>
      <legend>{m.planner_target({}, { locale })}</legend>
      <div class="target-tools">
        <button
          type="button"
          data-testid="targets-all"
          on:click={() => {
            selectedIds = actorTargets.map((unit) => unit.id);
            errors = { ...errors, target: undefined };
          }}>{m.planner_select_all({}, { locale })}</button
        >
        <button
          type="button"
          data-testid="targets-clear"
          on:click={() => {
            selectedIds = [];
          }}>{m.planner_clear_targets({}, { locale })}</button
        >
      </div>
      {#if !preview}<p class="helper">{m.planner_targets_unavailable({}, { locale })}</p>{/if}
      <TargetGrid
        participants={units}
        {labels}
        {selectedIds}
        {disabledIds}
        {avatar}
        onToggle={toggleTarget}
      />
      {#each missingIds as id}<button
          type="button"
          class="missing-target"
          on:click={() => toggleTarget(id)}>{m.planner_missing_target({}, { locale })} ×</button
        >{/each}
      {#if errors.target}<p class="error" role="alert" id="effect-target-error">
          {errors.target}
        </p>{/if}
    </fieldset>
    {#if type === 'advance' || type === 'delay'}
      <label
        >{m.planner_percent({}, { locale })}<input
          type="number"
          min="0"
          step="any"
          bind:value={percent}
          data-testid="effect-percent"
          aria-invalid={!!errors.percent}
          aria-describedby={errors.percent ? 'effect-percent-error' : undefined}
        /></label
      >
      {#if errors.percent}<p class="error" role="alert" id="effect-percent-error">
          {errors.percent}
        </p>{/if}
    {:else if type === 'addSpeedModifier'}
      <fieldset>
        <legend>{m.planner_speed_mode({}, { locale })}</legend>
        <div class="pills">
          {#each ['percent', 'flat'] as value}
            <button
              type="button"
              data-testid="speed-mode"
              data-value={value}
              aria-pressed={mode === value}
              on:click={() => {
                mode = value as 'flat' | 'percent';
              }}
              >{value === 'percent'
                ? m.planner_base_percent({}, { locale })
                : m.planner_flat({}, { locale })}</button
            >
          {/each}
        </div>
      </fieldset>
      <fieldset>
        <legend>{m.planner_duration_mode({}, { locale })}</legend>
        <div class="pills segmented">
          {#each ['turns', 'countdown'] as kind}
            <button
              type="button"
              data-testid="speed-duration-mode"
              data-value={kind}
              aria-pressed={durationDraft.kind === kind}
              on:click={() => {
                durationDraft.kind = kind as typeof durationDraft.kind;
                errors = {};
              }}
              >{kind === 'turns'
                ? m.planner_by_turns({}, { locale })
                : m.planner_by_countdown({}, { locale })}</button
            >
          {/each}
        </div>
      </fieldset>
      <div class="form-pair" class:countdown-amount={durationDraft.kind === 'countdown'}>
        <div>
          <label
            >{m.planner_amount({}, { locale })}<input
              type="number"
              step="any"
              bind:value={amount}
              data-testid="effect-amount"
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? 'effect-amount-error' : undefined}
            /></label
          >{#if errors.amount}<p class="error" role="alert" id="effect-amount-error">
              {errors.amount}
            </p>{/if}
        </div>
        {#if durationDraft.kind === 'turns'}
          <div>
            <label
              >{m.planner_duration({}, { locale })}<input
                type="text"
                inputmode="numeric"
                bind:value={durationDraft.turns}
                placeholder="∞"
                data-testid="effect-turns"
                aria-invalid={!!errors.turns}
                aria-describedby={errors.turns ? 'effect-turns-error' : undefined}
              /></label
            >
            {#if errors.turns}<p class="error" role="alert" id="effect-turns-error">
                {errors.turns}
              </p>{/if}
          </div>
        {/if}
      </div>
      {#if durationDraft.kind === 'countdown'}
        <div class="form-pair">
          <div>
            <label
              >{m.planner_countdown_name({}, { locale })}<input
                type="text"
                bind:value={durationDraft.countdownName}
                data-testid="effect-countdown-name"
                aria-invalid={!!errors.countdownName}
                aria-describedby={errors.countdownName ? 'effect-countdown-name-error' : undefined}
              /></label
            >
            {#if errors.countdownName}<p
                class="error"
                role="alert"
                id="effect-countdown-name-error"
              >
                {errors.countdownName}
              </p>{/if}
          </div>
          <div>
            <label
              >{m.planner_countdown_speed({}, { locale })}<input
                type="number"
                min="0"
                step="any"
                bind:value={durationDraft.countdownSpeed}
                data-testid="effect-countdown-speed"
                aria-invalid={!!errors.countdownSpeed}
                aria-describedby={errors.countdownSpeed
                  ? 'effect-countdown-speed-error'
                  : undefined}
              /></label
            >
            {#if errors.countdownSpeed}<p
                class="error"
                role="alert"
                id="effect-countdown-speed-error"
              >
                {errors.countdownSpeed}
              </p>{/if}
          </div>
        </div>
      {/if}
    {/if}
    {#if errors.form}<p class="error" role="alert">{errors.form}</p>{/if}
    <div class="actions">
      <button class="accent" type="submit" data-testid="submit-effect"
        >{editingId
          ? m.planner_save_effect({}, { locale })
          : m.planner_add_effect({}, { locale })}</button
      >
      <button type="button" data-testid="cancel-effect" on:click={cancel}
        >{m.planner_cancel({}, { locale })}</button
      >
    </div>
  </form>
{/if}

<PresetSection
  {locale}
  {anchor}
  participants={units}
  {labels}
  {avatar}
  {presets}
  {selectedPreset}
  onSelect={fillPreset}
/>

<style>
  h3 {
    margin: 0;
    font-size: var(--font-body);
    font-weight: 650;
  }
  .helper {
    font-size: var(--font-helper);
    color: var(--text-secondary);
    line-height: 1.6;
    margin: var(--space-2) 0 0;
  }
  form {
    display: grid;
    gap: var(--space-4);
    margin-top: var(--space-3);
  }
  form h3 {
    color: var(--gold-soft);
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
    opacity: 0.4;
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
  .accent,
  .pills button[aria-pressed='true'] {
    border-color: var(--gold);
    color: var(--gold-soft);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .pills button {
    border-radius: 999px;
  }
  .types {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .target-tools {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .target-tools button {
    border: 0;
    background: none;
    color: var(--gold-soft);
    padding: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .form-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .countdown-amount {
    grid-template-columns: 1fr;
  }
  .error {
    color: #ffb4b4;
    font-size: var(--font-helper);
    margin: var(--space-1) 0 0;
  }
  input[aria-invalid='true'] {
    border-color: #ffb4b4;
  }
  .missing-target {
    margin-top: var(--space-2);
    color: #ffb4b4;
  }
  @media (max-width: 379px) {
    .form-pair {
      grid-template-columns: 1fr;
    }
  }
</style>
