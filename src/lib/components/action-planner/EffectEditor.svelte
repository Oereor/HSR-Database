<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { applyOperations, DEFAULT_LIMITS, validatePlan } from '$lib/action-planner/engine';
  import { canUseVonwacq, presetOperation, type PresetKind } from '$lib/action-planner/presets';
  import type {
    EffectOperation,
    EventAnchor,
    SimulationState,
    Target,
    UnitConfig
  } from '$lib/action-planner/types';

  export let locale: Locale;
  export let anchor: EventAnchor;
  export let operations: EffectOperation[];
  export let units: UnitConfig[];
  export let beforeEffects: SimulationState | undefined;
  export let presets: { vonwacq?: string; eagle?: string; dance?: string };
  export let onChange: (operations: EffectOperation[]) => void;
  export let nextId: () => string;

  let type: EffectOperation['type'] = 'advance';
  let targetKind: 'single' | 'multiple' | 'allies' | 'enemies' = 'single';
  let unitId = '';
  let selectedIds: string[] = [];
  let instanceIds: string[] = [];
  let percent: number | undefined = 50;
  let amount: number | undefined = 10;
  let turns: number | undefined = 2;
  let mode: 'flat' | 'percent' = 'flat';
  let superimposition: number = 1;
  let editingId: string | undefined;
  let invalid = false;
  $: if (!unitId && units.length) unitId = units[0].id;
  $: editingIndex = operations.findIndex((op) => op.id === editingId);
  $: preview = previewAt(
    beforeEffects,
    operations.slice(0, editingIndex < 0 ? operations.length : editingIndex)
  );
  $: availableInstances =
    preview.state?.units.flatMap((unit) => unit.modifiers.map((buff) => ({ unit, buff }))) ?? [];
  $: selectedUnit = units.find((unit) => unit.id === unitId);
  $: vonwacqAvailable = canUseVonwacq(anchor, selectedUnit?.panelSpeed);

  function previewAt(state: SimulationState | undefined, prefix: EffectOperation[]) {
    if (!state) return { state: undefined, error: false };
    try {
      return { state: applyOperations(state, prefix, anchor).state, error: false };
    } catch {
      return { state: undefined, error: true };
    }
  }
  function effectLabel(value: EffectOperation['type']) {
    switch (value) {
      case 'advance':
        return m.planner_advance({}, { locale });
      case 'delay':
        return m.planner_delay({}, { locale });
      case 'immediatelyAct':
        return m.planner_immediate({}, { locale });
      case 'addSpeedModifier':
        return m.planner_add_speed({}, { locale });
      case 'removeSpeedModifier':
        return m.planner_remove_speed({}, { locale });
    }
  }
  function name(id: string) {
    return units.find((unit) => unit.id === id)?.name ?? m.planner_unknown_unit({ id }, { locale });
  }
  function targetLabel(target: Target) {
    return target.kind === 'allies'
      ? m.planner_all_allies({}, { locale })
      : target.kind === 'enemies'
        ? m.planner_all_enemies({}, { locale })
        : target.unitIds.map(name).join(', ');
  }
  function describe(op: EffectOperation) {
    if (op.type === 'removeSpeedModifier') return op.instanceIds.join(', ');
    const label = targetLabel(op.target);
    if (op.type === 'immediatelyAct') return label;
    if (op.type === 'advance' || op.type === 'delay') return `${label} · ${op.percent}%`;
    return `${label} · ${op.amount > 0 ? '+' : ''}${op.amount} ${op.mode === 'flat' ? 'SPD' : '%'} · ${m.planner_remaining_turns({ turns: op.turns }, { locale })}`;
  }
  function edit(op: EffectOperation) {
    type = op.type;
    editingId = op.id;
    invalid = false;
    if (op.type === 'removeSpeedModifier') {
      instanceIds = [...op.instanceIds];
      return;
    }
    if (op.target.kind === 'units') {
      targetKind = op.target.unitIds.length === 1 ? 'single' : 'multiple';
      unitId = op.target.unitIds[0] ?? '';
      selectedIds = [...op.target.unitIds];
    } else targetKind = op.target.kind;
    if (op.type === 'advance' || op.type === 'delay') percent = op.percent;
    if (op.type === 'addSpeedModifier') {
      amount = op.amount;
      turns = op.turns;
      mode = op.mode;
    }
  }
  function submit() {
    const id = editingId ?? nextId();
    const target: Target =
      targetKind === 'allies' || targetKind === 'enemies'
        ? { kind: targetKind }
        : { kind: 'units', unitIds: targetKind === 'single' ? [unitId] : [...selectedIds] };
    const op: EffectOperation =
      type === 'removeSpeedModifier'
        ? { id, type, instanceIds: [...instanceIds] }
        : type === 'immediatelyAct'
          ? { id, type, target }
          : type === 'addSpeedModifier'
            ? { id, type, target, mode, amount: amount ?? NaN, turns: turns ?? NaN }
            : { id, type, target, percent: percent ?? NaN };
    invalid =
      validatePlan({ units: [], events: [{ anchor, operations: [op] }], ...DEFAULT_LIMITS })
        .length > 0;
    if (invalid) return;
    onChange(
      editingId ? operations.map((old) => (old.id === editingId ? op : old)) : [...operations, op]
    );
    editingId = undefined;
    instanceIds = [];
  }
  function reorder(index: number, delta: number) {
    const next = [...operations];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }
  function fillPreset(kind: PresetKind) {
    if (kind === 'vonwacq' && !vonwacqAvailable) return;
    edit(presetOperation(kind, '', unitId, superimposition));
    editingId = undefined;
  }
</script>

<div class="effect-editor">
  <p class="helper">
    {anchor.kind === 'start'
      ? m.planner_start_window({}, { locale })
      : m.planner_window({}, { locale })}
  </p>
  <div class="operations" data-testid="planner-operations">
    {#each operations as op, index (op.id)}
      <div class="operation" data-operation-id={op.id}>
        <div>
          <strong>{index + 1}. {effectLabel(op.type)}</strong>
          <p>{describe(op)}</p>
          <small>{m.planner_instance_source({ id: op.id }, { locale })}</small>
        </div>
        <div class="operation-controls">
          <button type="button" data-testid="edit-effect" on:click={() => edit(op)}
            >{m.planner_edit({}, { locale })}</button
          >
          <button
            type="button"
            data-testid="move-effect-up"
            disabled={index === 0}
            aria-label={m.planner_up({}, { locale })}
            on:click={() => reorder(index, -1)}>↑</button
          >
          <button
            type="button"
            data-testid="move-effect-down"
            disabled={index === operations.length - 1}
            aria-label={m.planner_down({}, { locale })}
            on:click={() => reorder(index, 1)}>↓</button
          >
          <button
            type="button"
            data-testid="delete-effect"
            on:click={() => {
              onChange(operations.filter((old) => old.id !== op.id));
              if (editingId === op.id) editingId = undefined;
            }}>{m.planner_remove({}, { locale })}</button
          >
        </div>
      </div>
    {:else}<p class="helper">{m.planner_no_effects({}, { locale })}</p>{/each}
  </div>

  <form on:submit|preventDefault={submit}>
    <label
      >{m.planner_effect_type({}, { locale })}
      <select bind:value={type} data-testid="effect-type">
        {#each ['advance', 'delay', 'immediatelyAct', 'addSpeedModifier', 'removeSpeedModifier'] as value}
          <option {value}>{effectLabel(value as EffectOperation['type'])}</option>
        {/each}
      </select>
    </label>
    {#if type !== 'removeSpeedModifier'}
      <label
        >{m.planner_target({}, { locale })}
        <select bind:value={targetKind} data-testid="target-kind">
          <option value="single">{m.planner_single({}, { locale })}</option><option value="multiple"
            >{m.planner_multiple({}, { locale })}</option
          >
          <option value="allies">{m.planner_all_allies({}, { locale })}</option><option
            value="enemies">{m.planner_all_enemies({}, { locale })}</option
          >
        </select>
      </label>
      {#if targetKind === 'single'}
        <label
          >{m.planner_target({}, { locale })}
          <select bind:value={unitId} data-testid="effect-target">
            {#if unitId && !units.some((unit) => unit.id === unitId)}<option value={unitId}
                >{name(unitId)}</option
              >{/if}
            {#each units as unit}<option value={unit.id}>{unit.name}</option>{/each}
          </select>
        </label>
      {:else if targetKind === 'multiple'}
        <fieldset>
          <legend>{m.planner_target({}, { locale })}</legend>
          {#each units as unit}<label class="check"
              ><input type="checkbox" bind:group={selectedIds} value={unit.id} />{unit.name}</label
            >{/each}
          {#each selectedIds.filter((id) => !units.some((unit) => unit.id === id)) as id}<label
              class="check"
              ><input type="checkbox" bind:group={selectedIds} value={id} />{name(id)}</label
            >{/each}
        </fieldset>
      {/if}
    {/if}
    {#if type === 'advance' || type === 'delay'}
      <label
        >{m.planner_percent({}, { locale })}<input
          type="number"
          min="0"
          step="any"
          bind:value={percent}
          data-testid="effect-percent"
          required
        /></label
      >
    {:else if type === 'addSpeedModifier'}
      <label
        >{m.planner_speed_mode({}, { locale })}<select bind:value={mode} data-testid="speed-mode"
          ><option value="flat">{m.planner_flat({}, { locale })}</option><option value="percent"
            >{m.planner_base_percent({}, { locale })}</option
          ></select
        ></label
      >
      <div class="form-pair">
        <label
          >{m.planner_amount({}, { locale })}<input
            type="number"
            step="any"
            bind:value={amount}
            data-testid="effect-amount"
            required
          /></label
        >
        <label
          >{m.planner_duration({}, { locale })}<input
            type="number"
            min="1"
            step="1"
            bind:value={turns}
            data-testid="effect-turns"
            required
          /></label
        >
      </div>
    {:else if type === 'removeSpeedModifier'}
      {#if preview.error}<p class="error" role="alert">
          {m.planner_preview_error({}, { locale })}
        </p>{/if}
      <fieldset>
        <legend>{m.planner_buff_instance({}, { locale })}</legend>
        {#each availableInstances as entry (entry.buff.id)}
          <label class="check"
            ><input
              type="checkbox"
              bind:group={instanceIds}
              value={entry.buff.id}
              data-testid="buff-instance"
            />
            <span
              >{entry.unit.name} · {entry.buff.amount > 0 ? '+' : ''}{entry.buff.amount}{entry.buff
                .mode === 'percent'
                ? '%'
                : ' SPD'} · {m.planner_remaining_turns(
                { turns: entry.buff.remainingTurns },
                { locale }
              )}<small>{entry.buff.id}</small></span
            >
          </label>
        {:else}<p class="helper">{m.planner_no_buffs({}, { locale })}</p>{/each}
        {#each instanceIds.filter((id) => !availableInstances.some((entry) => entry.buff.id === id)) as id}<label
            class="check"
            ><input type="checkbox" bind:group={instanceIds} value={id} />{m.planner_unknown_buff(
              { id },
              { locale }
            )}</label
          >{/each}
      </fieldset>
    {/if}
    {#if invalid}<p class="error" role="alert">{m.planner_form_invalid({}, { locale })}</p>{/if}
    <div class="actions">
      <button class="accent" type="submit" data-testid="submit-effect"
        >{editingId
          ? m.planner_save_effect({}, { locale })
          : m.planner_add_effect({}, { locale })}</button
      >
      {#if editingId}<button
          type="button"
          on:click={() => {
            editingId = undefined;
            invalid = false;
          }}>{m.planner_cancel({}, { locale })}</button
        >{/if}
    </div>
  </form>

  <details class="presets">
    <summary>{m.planner_presets({}, { locale })}</summary>
    <label
      >{m.planner_target({}, { locale })}<select bind:value={unitId} data-testid="preset-target"
        >{#each units as unit}<option value={unit.id}>{unit.name}</option>{/each}</select
      ></label
    >
    <label
      >{m.planner_superimposition({}, { locale })}<select
        bind:value={superimposition}
        data-testid="preset-superimposition"
        >{#each [1, 2, 3, 4, 5] as value}<option {value}>{value}</option>{/each}</select
      ></label
    >
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
        disabled={!selectedUnit}
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
  .helper,
  small {
    font-size: var(--font-helper);
    color: var(--text-secondary);
  }
  .helper {
    margin: 0 0 var(--space-4);
    line-height: 1.65;
  }
  .operations {
    margin-bottom: var(--space-4);
  }
  .operation {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
  }
  .operation strong {
    font-size: var(--font-meta-value);
  }
  .operation p {
    margin: var(--space-1) 0;
    font-size: var(--font-helper);
    overflow-wrap: anywhere;
  }
  .operation-controls,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  form {
    display: grid;
    gap: var(--space-3);
  }
  label {
    display: grid;
    gap: var(--space-2);
    font-size: var(--font-meta-key);
    color: var(--text-body);
    min-width: 0;
  }
  input,
  select,
  button {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--text-primary);
  }
  select,
  input[type='number'] {
    width: 100%;
  }
  button {
    cursor: pointer;
    font-size: var(--font-helper);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  button:hover:not(:disabled) {
    border-color: var(--gold);
  }
  .accent {
    border-color: var(--gold);
    color: var(--gold-soft);
  }
  .form-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  fieldset {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-3);
  }
  legend {
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }
  .check {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    overflow-wrap: anywhere;
  }
  .check input {
    width: auto;
    margin-top: 0.2rem;
  }
  small {
    display: block;
    overflow-wrap: anywhere;
  }
  .presets {
    border-top: 1px solid var(--border);
    margin-top: var(--space-6);
    padding-top: var(--space-4);
  }
  .presets summary {
    cursor: pointer;
    margin-bottom: var(--space-3);
  }
  .presets label {
    margin-bottom: var(--space-3);
  }
  .error {
    color: #ffb4b4;
    font-size: var(--font-helper);
  }
  @media (max-width: 479px) {
    .form-pair {
      grid-template-columns: 1fr;
    }
  }
</style>
