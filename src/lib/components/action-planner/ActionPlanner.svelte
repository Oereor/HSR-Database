<script lang="ts">
  import { tick } from 'svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import CharacterSlot from './CharacterSlot.svelte';
  import CharacterSelector from './CharacterSelector.svelte';
  import {
    configuredAllies,
    selectSlotCharacter,
    type CharacterSlotDraft
  } from '$lib/action-planner/character-selection';
  import ActionCard from './ActionCard.svelte';
  import { futureActionCard, queueActionCard } from '$lib/action-planner/presentation';
  import EffectEditor from './EffectEditor.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { localizedHref } from '$lib/i18n/routing';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import { anchorKey, DEFAULT_LIMITS, HARD_LIMITS, simulatePlan } from '$lib/action-planner/engine';
  import type {
    DiagnosticCode,
    EffectOperation,
    EventAnchor,
    PlanEvent,
    PlannerCharacterOption
  } from '$lib/action-planner/types';

  export let locale: Locale;
  export let characters: PlannerCharacterOption[];
  export let presets: { vonwacq?: string; eagle?: string; dance?: string };

  let serial = 0;
  const nextId = () => `planner-${++serial}`;
  const emptySlot = (): CharacterSlotDraft => ({ id: nextId(), characterId: '', name: '' });
  let allies: CharacterSlotDraft[] = Array.from({ length: 4 }, emptySlot);
  let selectorSlot: number | undefined;
  let focusSlot = 0;
  let slotComponents: CharacterSlot[] = [];
  $: occupiedIds = allies
    .filter((_, index) => index !== selectorSlot)
    .map((slot) => slot.characterId);
  let events: PlanEvent[] = [];
  let maxNodes: number | undefined = DEFAULT_LIMITS.maxNodes;
  let maxAV: number | undefined = DEFAULT_LIMITS.maxAV;
  let view: 'predict' | 'queue' = 'predict';
  let queueStep = 0;
  let queueAnchor: EventAnchor = { kind: 'start' };
  let selectedAnchor: EventAnchor = { kind: 'start' };

  $: actors = configuredAllies(allies).map((actor) => ({ ...actor, iconUrl: avatar(actor.id) }));
  $: result = simulatePlan({ actors, events, maxNodes: maxNodes ?? NaN, maxAV: maxAV ?? NaN });
  $: selectedKey = anchorKey(selectedAnchor);
  $: selectedOperations =
    events.find((event) => anchorKey(event.anchor) === selectedKey)?.operations ?? [];
  $: selectedRecord = result.records.find((record) => anchorKey(record.anchor) === selectedKey);
  $: replayStep =
    queueAnchor.kind !== 'start'
      ? result.records.findIndex((record) => anchorKey(record.anchor) === anchorKey(queueAnchor)) +
        1
      : 0;
  $: safeStep =
    view === 'queue' && replayStep > 0
      ? replayStep
      : Math.min(queueStep, Math.max(0, result.snapshots.length - 1));
  $: snapshot = result.snapshots[safeStep];
  $: unreachedEvents = events.filter(
    (event) =>
      event.operations.length &&
      anchorKey(event.anchor) !== 'start' &&
      !result.records.some((record) => anchorKey(record.anchor) === anchorKey(event.anchor))
  );

  function selectCharacter(character: PlannerCharacterOption) {
    if (selectorSlot === undefined || occupiedIds.includes(character.id)) return;
    const index = selectorSlot;
    allies = allies.map((slot, i) =>
      i === index ? selectSlotCharacter(slot, character, nextId) : slot
    );
    selectorSlot = undefined;
  }
  async function restoreSlotFocus() {
    await tick();
    slotComponents[focusSlot]?.focusTrigger();
  }
  async function removeCharacter(index: number) {
    allies = allies.map((slot, i) => (i === index ? emptySlot() : slot));
    focusSlot = index;
    await restoreSlotFocus();
  }
  function unitName(id: string) {
    return (
      result.participants.find((participant) => participant.id === id)?.name ??
      m.planner_unknown_unit({ id }, { locale })
    );
  }
  function anchorName(anchor: EventAnchor) {
    return anchor.kind === 'start'
      ? m.planner_start({}, { locale })
      : `${unitName(anchor.participantId)} · ${anchor.kind === 'action' ? m.planner_turn({ turn: anchor.turn }, { locale }) : m.planner_scheduled_event({}, { locale })}`;
  }
  function avatar(id: string) {
    const draft = allies.find((unit) => unit.id === id);
    const character = characters.find((option) => option.id === draft?.characterId);
    return character ? getCharacterIconUrl(character.avatarId) : undefined;
  }
  function operationsAt(anchor: EventAnchor, source: PlanEvent[]) {
    return source.find((event) => anchorKey(event.anchor) === anchorKey(anchor))?.operations ?? [];
  }
  function updateOperations(operations: EffectOperation[]) {
    const old = events.find((event) => anchorKey(event.anchor) === selectedKey);
    const updated = { anchor: { ...selectedAnchor }, operations };
    events = old ? events.map((event) => (event === old ? updated : event)) : [...events, updated];
  }
  function deleteEvent(anchor: EventAnchor) {
    events = events.filter((event) => anchorKey(event.anchor) !== anchorKey(anchor));
  }
  function stepTo(index: number) {
    queueStep = index;
    queueAnchor = index > 0 ? result.records[index - 1].anchor : { kind: 'start' };
    selectedAnchor = queueAnchor;
  }
  function reset() {
    allies = Array.from({ length: 4 }, emptySlot);
    selectorSlot = undefined;
    events = [];
    maxNodes = DEFAULT_LIMITS.maxNodes;
    maxAV = DEFAULT_LIMITS.maxAV;
    queueStep = 0;
    queueAnchor = { kind: 'start' };
    selectedAnchor = { kind: 'start' };
    view = 'predict';
  }
  function format(value: number) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  }
  function diagnosticText(code: DiagnosticCode) {
    switch (code) {
      case 'invalid-input':
        return m.planner_diagnostic_invalid_input({}, { locale });
      case 'invalid-speed':
        return m.planner_diagnostic_invalid_speed({}, { locale });
      case 'non-finite':
        return m.planner_diagnostic_non_finite({}, { locale });
      case 'missing-target':
        return m.planner_diagnostic_missing_target({}, { locale });
      case 'invalid-target':
        return m.planner_diagnostic_invalid_target({}, { locale });
      case 'duplicate-participant':
        return m.planner_diagnostic_duplicate_participant({}, { locale });
      case 'active-target':
        return m.planner_diagnostic_active_target({}, { locale });
      case 'unreached-anchor':
        return m.planner_diagnostic_unreached_anchor({}, { locale });
      case 'no-participants':
        return m.planner_diagnostic_no_units({}, { locale });
    }
  }
</script>

<CharacterSelector
  {locale}
  {characters}
  open={selectorSlot !== undefined}
  selectedId={selectorSlot === undefined ? '' : allies[selectorSlot].characterId}
  {occupiedIds}
  onSelect={selectCharacter}
  onRequestClose={() => {
    selectorSlot = undefined;
  }}
  onClosed={restoreSlotFocus}
/>

<div class="planner" data-testid="action-planner">
  <header class="planner-heading">
    <div>
      <a class="eyebrow" href={localizedHref('/game-tools', locale)}
        >{m.navigation_game_tools({}, { locale })}</a
      >
      <h1>{m.planner_title({}, { locale })}</h1>
      <p>{m.planner_description({}, { locale })}</p>
    </div>
    <button type="button" data-testid="reset-plan" on:click={reset}
      >{m.planner_reset({}, { locale })}</button
    >
  </header>
  <div class="workspace">
    <aside class="configuration" aria-label={m.planner_allies({}, { locale })}>
      <section class="team-section">
        <SectionHeading level={2}>{m.planner_allies({}, { locale })}</SectionHeading>
        <div class="team-slots">
          {#each allies as unit, index (index)}
            <CharacterSlot
              bind:this={slotComponents[index]}
              bind:slot={allies[index]}
              {locale}
              position={index}
              character={characters.find((character) => character.id === unit.characterId)}
              onOpen={() => {
                focusSlot = index;
                selectorSlot = index;
              }}
              onRemove={() => removeCharacter(index)}
            />
          {/each}
        </div>
        <p class="helper">{m.planner_speed_note({}, { locale })}</p>
      </section>
      <section class="config-section">
        <h2>{m.planner_limits({}, { locale })}</h2>
        <div class="speed-fields">
          <label
            >{m.planner_max_actions({}, { locale })}<input
              type="number"
              min="1"
              max={HARD_LIMITS.maxNodes}
              step="1"
              bind:value={maxNodes}
              data-testid="max-actions"
            /></label
          >
          <label
            >{m.planner_max_av({}, { locale })}<input
              type="number"
              min="0"
              max={HARD_LIMITS.maxAV}
              step="any"
              bind:value={maxAV}
              data-testid="max-av"
            /></label
          >
        </div>
      </section>
      <details class="instructions">
        <summary>{m.planner_help({}, { locale })}</summary>
        <p>{m.planner_help_text({}, { locale })}</p>
        <p>{m.planner_limitations({}, { locale })}</p>
      </details>
    </aside>

    <section class="results" aria-label={m.planner_title({}, { locale })}>
      <div class="view-controls" role="group" aria-label={m.planner_title({}, { locale })}>
        <button
          type="button"
          aria-pressed={view === 'predict'}
          data-testid="view-predict"
          on:click={() => {
            view = 'predict';
          }}>{m.planner_predict({}, { locale })}</button
        >
        <button
          type="button"
          aria-pressed={view === 'queue'}
          data-testid="view-queue"
          on:click={() => {
            view = 'queue';
          }}>{m.planner_queue({}, { locale })}</button
        >
      </div>
      {#if result.stopReason === 'error'}<p class="error" role="alert">
          {m.planner_prefix({}, { locale })}
        </p>{/if}
      {#if result.diagnostics.length}
        <ul class="diagnostics" data-testid="planner-diagnostics" aria-live="polite">
          {#each result.diagnostics as diagnostic}
            <li class:error={diagnostic.severity === 'error'} data-code={diagnostic.code}>
              {#if diagnostic.anchor}<button
                  type="button"
                  class="text-button"
                  on:click={() => {
                    selectedAnchor = diagnostic.anchor!;
                  }}>{anchorName(diagnostic.anchor)}</button
                > ·
              {/if}
              {diagnosticText(diagnostic.code)}
            </li>
          {/each}
        </ul>
      {/if}
      <div class="result-layout">
        <div class="sequence">
          {#if view === 'predict'}
            <div class="action-list" data-testid="action-list">
              <ActionCard
                {locale}
                card={{
                  kind: 'system',
                  anchor: { kind: 'start' },
                  name: m.planner_start({}, { locale }),
                  elapsedAV: 0
                }}
                operations={operationsAt({ kind: 'start' }, events)}
                selected={selectedKey === 'start'}
                onSelect={() => {
                  selectedAnchor = { kind: 'start' };
                }}
              />
              {#each result.records as record (anchorKey(record.anchor))}
                <ActionCard
                  {locale}
                  card={futureActionCard(record)}
                  avatar={record.iconUrl ?? avatar(record.anchor.participantId)}
                  operations={operationsAt(record.anchor, events)}
                  selected={selectedKey === anchorKey(record.anchor)}
                  onSelect={() => {
                    selectedAnchor = record.anchor;
                  }}
                />
              {/each}
            </div>
          {:else}
            <div class="queue-controls">
              <button
                type="button"
                data-testid="queue-previous"
                disabled={safeStep === 0}
                on:click={() => stepTo(safeStep - 1)}>{m.planner_previous({}, { locale })}</button
              >
              <button
                type="button"
                data-testid="queue-next"
                disabled={!snapshot || safeStep >= result.snapshots.length - 1}
                on:click={() => stepTo(safeStep + 1)}>{m.planner_next({}, { locale })}</button
              >
            </div>
            {#if snapshot}
              <p
                class="queue-status"
                data-testid="queue-status"
                data-step={safeStep}
                data-total-av={snapshot.elapsedAV}
              >
                {m.planner_completed({ count: snapshot.completedNodes }, { locale })} · {format(
                  snapshot.elapsedAV
                )} AV
              </p>
              <div class="queue-list" data-testid="queue-list">
                {#each snapshot.queue as entry (entry.id)}
                  {@const card = queueActionCard(entry)}
                  <ActionCard
                    {locale}
                    {card}
                    avatar={avatar(entry.id)}
                    operations={operationsAt(card.anchor, events)}
                    selected={selectedKey === anchorKey(card.anchor)}
                    onSelect={() => {
                      selectedAnchor = card.anchor;
                    }}
                  />
                {/each}
              </div>
            {/if}
          {/if}
          {#if !actors.length && !snapshot?.queue.length}<p class="empty">
              {m.planner_empty({}, { locale })}
            </p>{/if}
          {#if result.stopReason === 'nodes'}<p class="helper">
              {m.planner_stop_actions({}, { locale })}
            </p>{:else if result.stopReason === 'av'}<p class="helper">
              {m.planner_stop_av({}, { locale })}
            </p>{/if}
          {#if unreachedEvents.length}
            <section class="unreached" data-testid="unreached-events">
              <h3>{m.planner_unreached({}, { locale })}</h3>
              {#each unreachedEvents as event (anchorKey(event.anchor))}<div>
                  <button
                    type="button"
                    class="text-button"
                    on:click={() => {
                      selectedAnchor = event.anchor;
                    }}>{anchorName(event.anchor)}</button
                  ><button type="button" on:click={() => deleteEvent(event.anchor)}
                    >{m.planner_delete_event({}, { locale })}</button
                  >
                </div>{/each}
            </section>
          {/if}
        </div>
        <aside
          class="editor-panel"
          data-testid="event-editor"
          aria-label={anchorName(selectedAnchor)}
        >
          <h2>{anchorName(selectedAnchor)}</h2>
          <p class="helper">
            {m.planner_effect_count({ count: selectedOperations.length }, { locale })}
          </p>
          {#if selectedRecord}<p class="helper">
              {format(selectedRecord.elapsedAV)}
              {m.planner_total_av({}, { locale })}
            </p>{/if}
          {#key selectedKey}<EffectEditor
              {locale}
              anchor={selectedAnchor}
              operations={selectedOperations}
              participants={selectedRecord?.beforeEffects.participants ??
                (selectedAnchor.kind === 'start' ? actors : (snapshot?.queue ?? actors))}
              catalog={result.participants}
              context={selectedRecord?.beforeEffects ??
                (selectedAnchor.kind === 'start' ? result.startState : undefined)}
              {avatar}
              {presets}
              onChange={updateOperations}
              {nextId}
            />{/key}
        </aside>
      </div>
    </section>
  </div>
</div>

<style>
  .planner {
    min-width: 0;
  }
  .planner-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }
  .eyebrow {
    color: var(--gold);
    font-size: var(--font-meta-key);
  }
  h1 {
    font-size: clamp(1.75rem, 3vw, 2.5rem);
    margin: var(--space-2) 0;
  }
  .planner-heading p {
    color: var(--text-secondary);
    margin: 0;
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(17rem, 0.85fr) minmax(0, 2fr);
    gap: var(--space-6);
    align-items: start;
  }
  .configuration,
  .results,
  .sequence {
    min-width: 0;
  }
  .team-slots {
    display: grid;
    gap: var(--space-3);
  }
  .configuration .config-section {
    margin-top: var(--space-6);
  }

  h2 {
    font-size: var(--font-major-title);
    margin: 0 0 var(--space-3);
  }
  h3 {
    font-size: var(--font-body);
  }
  label {
    display: grid;
    gap: var(--space-2);
    color: var(--text-body);
    font-size: var(--font-helper);
    min-width: 0;
  }
  input,
  button {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-2) var(--space-3);
    color: var(--text-primary);
    background: var(--surface-2);
    min-width: 0;
  }
  input {
    width: 100%;
  }
  button {
    cursor: pointer;
    font-size: var(--font-helper);
  }
  button:disabled {
    cursor: default;
    opacity: 0.45;
  }
  button:hover:not(:disabled) {
    border-color: var(--gold);
  }
  .helper,
  .empty,
  .instructions,
  .diagnostics {
    color: var(--text-secondary);
    font-size: var(--font-helper);
    line-height: 1.65;
  }
  .speed-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .queue-controls {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
    flex-wrap: wrap;
  }
  .instructions {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  summary {
    cursor: pointer;
  }
  .view-controls {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .view-controls button[aria-pressed='true'] {
    border-color: var(--gold);
    color: var(--gold-soft);
  }
  .result-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(16rem, 1fr);
    gap: var(--space-4);
    align-items: start;
  }
  .action-list,
  .queue-list {
    display: grid;
    gap: var(--space-2);
    max-height: 48rem;
    padding: 2px;
    overflow-y: auto;
  }
  .editor-panel {
    border-left: 1px solid var(--border);
    padding-left: var(--space-4);
    min-width: 0;
  }
  .editor-panel h2 {
    overflow-wrap: anywhere;
  }
  .diagnostics {
    margin: 0 0 var(--space-4);
    padding-left: var(--space-4);
  }
  .error {
    color: #ffb4b4;
    font-size: var(--font-helper);
  }
  .text-button {
    background: none;
    border: 0;
    color: var(--gold-soft);
    padding: 0;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .queue-status {
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }
  .unreached {
    margin-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  .unreached div {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: var(--space-2) 0;
  }
  @media (max-width: 1199px) {
    .workspace {
      grid-template-columns: 18rem minmax(0, 1fr);
    }
    .result-layout {
      grid-template-columns: 1fr;
    }
    .editor-panel {
      border-left: 0;
      border-top: 1px solid var(--border);
      padding: var(--space-4) 0 0;
    }
  }
  @media (max-width: 759px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }
    .planner-heading {
      align-items: flex-start;
      flex-direction: column;
    }
    .action-list,
    .queue-list {
      max-height: 32rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto;
    }
  }
</style>
