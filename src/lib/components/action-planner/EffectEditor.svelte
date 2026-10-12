<script lang="ts">
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { DEFAULT_LIMITS, validatePlan } from '$lib/action-planner/engine';
  import {
    effectPhase,
    moveOperation,
    phaseOperations,
    saveOperation,
    targetIds
  } from '$lib/action-planner/effect-config';
  import { canUseVonwacq, presetOperation, type PresetKind } from '$lib/action-planner/presets';
  import type {
    EffectOperation,
    EffectPhase,
    EventAnchor,
    UnitConfig
  } from '$lib/action-planner/types';
  import EffectCard from './EffectCard.svelte';
  import TargetGrid from './TargetGrid.svelte';

  export let locale: Locale;
  export let anchor: EventAnchor;
  export let operations: EffectOperation[];
  export let units: UnitConfig[];
  export let avatar: (id: string) => string | undefined;
  export let presets: { vonwacq?: string; eagle?: string; dance?: string };
  export let onChange: (operations: EffectOperation[]) => void;
  export let nextId: () => string;

  let opened = false;
  let editingId: string | undefined;
  let type: EffectOperation['type'] = 'advance';
  let phase: EffectPhase = 'preAction';
  let selectedIds: string[] = [];
  let percent: number | undefined = 50;
  let amount: number | undefined = 10;
  let turns = '2';
  let mode: 'flat' | 'percent' = 'flat';
  let presetTarget = units[0]?.id ?? '';
  let superimposition = 1;
  let errors: Partial<Record<'target' | 'percent' | 'amount' | 'turns' | 'form', string>> = {};
  let formHeading: HTMLHeadingElement;
  let addButton: HTMLButtonElement;

  $: groups =
    anchor.kind === 'start'
      ? [{ phase: undefined, operations }]
      : (['preAction', 'postAction'] as const).map((value) => ({
          phase: value,
          operations: phaseOperations(operations, value)
        }));
  $: if (!units.some((unit) => unit.id === presetTarget)) presetTarget = units[0]?.id ?? '';
  $: selectedPresetUnit = units.find((unit) => unit.id === presetTarget);
  $: vonwacqAvailable = canUseVonwacq(anchor, selectedPresetUnit?.panelSpeed);
  $: missingIds = selectedIds.filter((id) => !units.some((unit) => unit.id === id));

  function effectLabel(value: EffectOperation['type']) {
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
    editingId = undefined;
    type = 'advance';
    phase = 'preAction';
    selectedIds = units[0] ? [units[0].id] : [];
    percent = 50;
    amount = 10;
    turns = '2';
    mode = 'flat';
    errors = {};
  }
  function beginAdd() {
    resetDraft();
    opened = true;
    void focusForm();
  }
  async function cancel() {
    opened = false;
    resetDraft();
    await tick();
    addButton?.focus();
  }
  function edit(op: EffectOperation) {
    editingId = op.id;
    type = op.type;
    phase = effectPhase(op);
    selectedIds = targetIds(op.target, units);
    percent = op.type === 'advance' || op.type === 'delay' ? op.percent : 50;
    amount = op.type === 'addSpeedModifier' ? op.amount : 10;
    turns = op.type === 'addSpeedModifier' ? (op.turns === null ? '' : String(op.turns)) : '2';
    mode = op.type === 'addSpeedModifier' ? op.mode : 'flat';
    errors = {};
    opened = true;
    void focusForm();
  }
  function toggleTarget(id: string) {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
    errors = { ...errors, target: undefined };
  }
  async function submit() {
    errors = {};
    if (!selectedIds.length || missingIds.length)
      errors.target = m.planner_target_invalid({}, { locale });
    if (
      (type === 'advance' || type === 'delay') &&
      (percent === undefined || !Number.isFinite(percent) || percent < 0)
    )
      errors.percent = m.planner_percent_invalid({}, { locale });
    if (type === 'addSpeedModifier' && (amount === undefined || !Number.isFinite(amount)))
      errors.amount = m.planner_amount_invalid({}, { locale });
    const duration = turns.trim() === '' ? null : Number(turns);
    if (
      type === 'addSpeedModifier' &&
      duration !== null &&
      (!/^\d+$/.test(turns.trim()) || !Number.isSafeInteger(duration) || duration < 1)
    )
      errors.turns = m.planner_turns_invalid({}, { locale });
    if (Object.values(errors).some(Boolean)) return;
    const base = {
      id: editingId ?? nextId(),
      target: { kind: 'units' as const, unitIds: [...selectedIds] },
      ...(anchor.kind === 'action' ? { phase } : {})
    };
    const op: EffectOperation =
      type === 'immediatelyAct'
        ? { ...base, type }
        : type === 'addSpeedModifier'
          ? { ...base, type, mode, amount: amount!, turns: duration }
          : { ...base, type, percent: percent! };
    if (
      validatePlan({ units: [], events: [{ anchor, operations: [op] }], ...DEFAULT_LIMITS }).length
    ) {
      errors.form = m.planner_form_invalid({}, { locale });
      return;
    }
    onChange(saveOperation(operations, op, anchor));
    await cancel();
  }
  function remove(id: string) {
    onChange(operations.filter((op) => op.id !== id));
    if (editingId === id) void cancel();
  }
  function fillPreset(kind: PresetKind) {
    if (kind === 'vonwacq' && !vonwacqAvailable) return;
    const currentPhase = opened ? phase : 'preAction';
    edit(presetOperation(kind, '', presetTarget, superimposition));
    editingId = undefined;
    phase = currentPhase;
  }
</script>

<div class="effect-editor">
  {#if anchor.kind === 'start'}<p class="helper system-note">
      {m.planner_start_window({}, { locale })}
    </p>{/if}
  <div class="list-heading">
    <h3>{m.planner_configured_effects({}, { locale })}</h3>
    <button
      bind:this={addButton}
      type="button"
      class="accent"
      data-testid="add-effect"
      on:click={beginAdd}>+ {m.planner_add_effect({}, { locale })}</button
    >
  </div>
  <div class="operations" data-testid="planner-operations">
    {#each groups as group}
      <section class="effect-group" data-phase-group={group.phase ?? 'system'}>
        {#if group.phase}<h4>
            {group.phase === 'preAction'
              ? m.planner_pre_action({}, { locale })
              : m.planner_post_action({}, { locale })}<span>{group.operations.length}</span>
          </h4>{/if}
        {#each group.operations as op, index (op.id)}
          <EffectCard
            {locale}
            operation={op}
            {units}
            {avatar}
            system={anchor.kind === 'start'}
            selected={editingId === op.id}
            first={index === 0}
            last={index === group.operations.length - 1}
            onEdit={() => edit(op)}
            onMove={(delta) => onChange(moveOperation(operations, op.id, delta, anchor))}
            onDelete={() => remove(op.id)}
          />
        {:else}<p class="helper empty-group">{m.planner_no_effects({}, { locale })}</p>{/each}
      </section>
    {/each}
  </div>

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
                type = value as EffectOperation['type'];
                errors = {};
              }}>{effectLabel(value as EffectOperation['type'])}</button
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
              selectedIds = units.map((unit) => unit.id);
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
        <TargetGrid {units} {selectedIds} {avatar} onToggle={toggleTarget} />
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
        <div class="form-pair">
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
          <div>
            <label
              >{m.planner_duration({}, { locale })}<input
                type="text"
                inputmode="numeric"
                bind:value={turns}
                placeholder="∞"
                data-testid="effect-turns"
                aria-invalid={!!errors.turns}
                aria-describedby={errors.turns ? 'effect-turns-error' : 'effect-turns-help'}
              /></label
            >
            <p class="helper" id="effect-turns-help">{m.planner_duration_help({}, { locale })}</p>
            {#if errors.turns}<p class="error" role="alert" id="effect-turns-error">
                {errors.turns}
              </p>{/if}
          </div>
        </div>
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

  <details class="presets">
    <summary>{m.planner_presets({}, { locale })}</summary>
    <fieldset>
      <legend>{m.planner_target({}, { locale })}</legend>
      <TargetGrid
        {units}
        selectedIds={[presetTarget]}
        {avatar}
        testId="preset-target"
        onToggle={(id) => {
          presetTarget = id;
        }}
      />
    </fieldset>
    <fieldset>
      <legend>{m.planner_superimposition({}, { locale })}</legend>
      <div class="pills">
        {#each [1, 2, 3, 4, 5] as value}<button
            type="button"
            data-testid="preset-superimposition"
            data-value={value}
            aria-pressed={superimposition === value}
            on:click={() => {
              superimposition = value;
            }}>{value}</button
          >{/each}
      </div>
    </fieldset>
    <div class="actions">
      <button
        type="button"
        data-testid="preset-vonwacq"
        disabled={!vonwacqAvailable}
        on:click={() => fillPreset('vonwacq')}
        >{presets.vonwacq ?? m.planner_preset_fallback({ index: 1 }, { locale })}</button
      >
      <button
        type="button"
        data-testid="preset-eagle"
        disabled={!selectedPresetUnit}
        on:click={() => fillPreset('eagle')}
        >{presets.eagle ?? m.planner_preset_fallback({ index: 2 }, { locale })}</button
      >
      <button
        type="button"
        data-testid="preset-dance"
        disabled={!units.some((unit) => unit.camp === 'ally')}
        on:click={() => fillPreset('dance')}
        >{presets.dance ?? m.planner_preset_fallback({ index: 3 }, { locale })}</button
      >
    </div>
    <p class="helper">{m.planner_vonwacq_note({}, { locale })}</p>
    <p class="helper">{m.planner_preset_note({}, { locale })}</p>
  </details>
</div>

<style>
  .effect-editor {
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--font-body);
    font-weight: 650;
  }
  h4 {
    margin: 0 0 var(--space-2);
    display: flex;
    gap: var(--space-2);
    font-size: var(--font-helper);
    font-weight: 500;
    color: var(--text-secondary);
  }
  h4 span {
    color: var(--gold-soft);
  }
  .list-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .operations,
  .effect-group {
    display: grid;
    gap: var(--space-2);
  }
  .operations {
    gap: var(--space-4);
  }
  .helper {
    font-size: var(--font-helper);
    color: var(--text-secondary);
    line-height: 1.6;
    margin: var(--space-2) 0 0;
  }
  .system-note {
    margin: 0 0 var(--space-3);
  }
  .empty-group {
    margin: 0;
    padding: var(--space-2);
    border: 1px dashed var(--border);
    border-radius: var(--radius-control);
  }
  form {
    display: grid;
    gap: var(--space-4);
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
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
  summary:focus-visible,
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
  .presets {
    margin-top: var(--space-4);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }
  summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }
  .presets fieldset,
  .presets .actions {
    margin-top: var(--space-3);
  }
  @media (max-width: 379px) {
    .form-pair {
      grid-template-columns: 1fr;
    }
    .list-heading {
      align-items: flex-start;
      flex-wrap: wrap;
    }
  }
</style>
