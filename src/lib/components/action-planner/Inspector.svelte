<script lang="ts">
  import type { ParticipantLabels } from '$lib/action-planner/presentation';
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { saveOperation } from '$lib/action-planner/effect-config';
  import type {
    EffectOperation,
    EventAnchor,
    ParticipantInfo,
    SimulationState
  } from '$lib/action-planner/types';
  import OperationList from './OperationList.svelte';
  import EffectForm from './EffectForm.svelte';
  import ParticipantForm from './ParticipantForm.svelte';
  export let labels: ParticipantLabels = new Map();
  export let locale: Locale;
  export let anchor: EventAnchor;
  export let operations: EffectOperation[];
  export let catalog: ParticipantInfo[];
  export let context: SimulationState | undefined = undefined;
  export let avatar: (id: string) => string | undefined;
  export let presets: { vonwacq?: string; eagle?: string; dance?: string };
  export let onChange: (operations: EffectOperation[]) => void;
  export let nextId: () => string;
  let tab: 'effect' | 'participant' = 'effect';
  let effectEditingId: string | undefined;
  let participantEditingId: string | undefined;
  let effectForm: EffectForm;
  let participantForm: ParticipantForm;
  let effectTab: HTMLButtonElement;
  let participantTab: HTMLButtonElement;
  function save(operation: EffectOperation) {
    onChange(saveOperation(operations, operation, anchor));
  }
  async function edit(operation: EffectOperation) {
    tab = operation.type === 'spawnParticipant' ? 'participant' : 'effect';
    await tick();
    if (operation.type === 'spawnParticipant') participantForm.edit(operation);
    else effectForm.edit(operation);
  }
  function remove(id: string) {
    onChange(operations.filter((operation) => operation.id !== id));
    if (effectEditingId === id) void effectForm.cancel();
    if (participantEditingId === id) void participantForm.cancel();
  }
  function navigateTabs(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    tab =
      event.key === 'Home'
        ? 'effect'
        : event.key === 'End'
          ? 'participant'
          : tab === 'effect'
            ? 'participant'
            : 'effect';
    (tab === 'effect' ? effectTab : participantTab).focus();
  }
</script>

<div class="inspector">
  <OperationList
    {locale}
    {labels}
    {anchor}
    {operations}
    {catalog}
    {context}
    {avatar}
    editingId={tab === 'effect' ? effectEditingId : participantEditingId}
    onEdit={edit}
    {onChange}
    onDelete={remove}
  />
  <div class="tabs" role="tablist" aria-label={m.planner_operation_editor({}, { locale })}>
    <button
      bind:this={effectTab}
      type="button"
      role="tab"
      id="inspector-effect-tab"
      aria-controls="inspector-effect-panel"
      aria-selected={tab === 'effect'}
      tabindex={tab === 'effect' ? 0 : -1}
      data-testid="inspector-tab-effect"
      on:keydown={navigateTabs}
      on:click={() => {
        tab = 'effect';
      }}>{m.planner_add_effect({}, { locale })}</button
    >
    <button
      bind:this={participantTab}
      type="button"
      role="tab"
      id="inspector-participant-tab"
      aria-controls="inspector-participant-panel"
      aria-selected={tab === 'participant'}
      tabindex={tab === 'participant' ? 0 : -1}
      data-testid="inspector-tab-participant"
      on:keydown={navigateTabs}
      on:click={() => {
        tab = 'participant';
      }}>{m.planner_add_participant({}, { locale })}</button
    >
  </div>
  <div
    class="tab-panel"
    role="tabpanel"
    id="inspector-effect-panel"
    aria-labelledby="inspector-effect-tab"
    hidden={tab !== 'effect'}
  >
    <EffectForm
      bind:this={effectForm}
      {locale}
      {labels}
      {anchor}
      {operations}
      {context}
      {avatar}
      {presets}
      bind:editingId={effectEditingId}
      onSave={save}
      {nextId}
    />
  </div>
  <div
    class="tab-panel"
    role="tabpanel"
    id="inspector-participant-panel"
    aria-labelledby="inspector-participant-tab"
    hidden={tab !== 'participant'}
  >
    <ParticipantForm
      bind:this={participantForm}
      {locale}
      {anchor}
      bind:editingId={participantEditingId}
      onSave={save}
      {nextId}
    />
  </div>
</div>

<style>
  .inspector {
    min-width: 0;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    border-top: 1px solid var(--border);
    margin-top: var(--space-4);
    padding-top: var(--space-3);
  }
  .tabs button {
    min-width: 0;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--text-secondary);
    font: inherit;
    font-size: var(--font-helper);
    cursor: pointer;
  }
  .tabs button[aria-selected='true'] {
    color: var(--gold-soft);
    border-color: var(--gold);
    background: var(--surface-2);
    box-shadow: inset 0 -2px var(--gold);
  }
  .tabs button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .tab-panel {
    margin-top: var(--space-3);
  }
</style>
