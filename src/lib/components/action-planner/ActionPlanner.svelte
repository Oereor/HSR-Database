<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import EffectEditor from './EffectEditor.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { localizedHref } from '$lib/i18n/routing';
  import { resolveCharacterPreviewAsset } from '$lib/data/visual-assets';
  import { anchorKey, DEFAULT_LIMITS, HARD_LIMITS, simulatePlan } from '$lib/action-planner/engine';
  import type {
    DiagnosticCode,
    EffectOperation,
    EventAnchor,
    PlanEvent,
    PlannerCharacterOption,
    UnitConfig
  } from '$lib/action-planner/types';

  export let locale: Locale;
  export let characters: PlannerCharacterOption[];
  export let presets: { vonwacq?: string; eagle?: string; dance?: string };

  interface UnitDraft {
    id: string;
    characterId: string;
    name: string;
    baseSpeed?: number;
    panelSpeed?: number;
  }
  let serial = 0;
  const nextId = () => `planner-${++serial}`;
  const emptySlot = (): UnitDraft => ({ id: nextId(), characterId: '', name: '' });
  let allies: UnitDraft[] = Array.from({ length: 4 }, emptySlot);
  let enemies: UnitDraft[] = [];
  let events: PlanEvent[] = [];
  let maxActions: number | undefined = DEFAULT_LIMITS.maxActions;
  let maxAV: number | undefined = DEFAULT_LIMITS.maxAV;
  let view: 'predict' | 'queue' = 'predict';
  let queueStep = 0;
  let selectedAnchor: EventAnchor = { kind: 'start' };

  $: units = configuredUnits(allies, enemies);
  $: result = simulatePlan({ units, events, maxActions: maxActions ?? NaN, maxAV: maxAV ?? NaN });
  $: selectedKey = anchorKey(selectedAnchor);
  $: selectedOperations =
    events.find((event) => anchorKey(event.anchor) === selectedKey)?.operations ?? [];
  $: selectedRecord = result.records.find((record) => anchorKey(record.anchor) === selectedKey);
  $: beforeEffects =
    selectedAnchor.kind === 'start' ? result.startState : selectedRecord?.beforeEffects;
  $: safeStep = Math.min(queueStep, Math.max(0, result.snapshots.length - 1));
  $: snapshot = result.snapshots[safeStep];
  $: unreachedEvents = events.filter(
    (event) =>
      event.operations.length &&
      anchorKey(event.anchor) !== 'start' &&
      !result.records.some((record) => anchorKey(record.anchor) === anchorKey(event.anchor))
  );

  function configuredUnits(allyDrafts: UnitDraft[], enemyDrafts: UnitDraft[]): UnitConfig[] {
    return [
      ...allyDrafts.flatMap((draft, position) =>
        draft.characterId
          ? [
              {
                id: draft.id,
                name: draft.name || m.planner_manual({}, { locale }),
                camp: 'ally' as const,
                position,
                baseSpeed: draft.baseSpeed ?? NaN,
                panelSpeed: draft.panelSpeed ?? NaN
              }
            ]
          : []
      ),
      ...enemyDrafts.map((draft, position) => ({
        id: draft.id,
        name: draft.name || m.planner_enemies({}, { locale }),
        camp: 'enemy' as const,
        position,
        baseSpeed: draft.panelSpeed ?? NaN,
        panelSpeed: draft.panelSpeed ?? NaN
      }))
    ];
  }
  function selectCharacter(index: number) {
    const draft = allies[index];
    const option = characters.find((character) => character.id === draft.characterId);
    allies = allies.map((old, i) =>
      i === index
        ? { ...old, id: nextId(), name: option?.name ?? '', baseSpeed: option?.baseSpeed }
        : old
    );
  }
  function unitName(id: string) {
    return units.find((unit) => unit.id === id)?.name ?? m.planner_unknown_unit({ id }, { locale });
  }
  function anchorName(anchor: EventAnchor) {
    return anchor.kind === 'start'
      ? m.planner_start({}, { locale })
      : `${unitName(anchor.unitId)} · ${m.planner_turn({ turn: anchor.turn }, { locale })}`;
  }
  function avatar(id: string) {
    const draft = allies.find((unit) => unit.id === id);
    const character = characters.find((option) => option.id === draft?.characterId);
    return character ? resolveCharacterPreviewAsset(character.avatarId) : undefined;
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
    selectedAnchor = index > 0 ? result.records[index - 1].anchor : { kind: 'start' };
  }
  function moveEnemy(index: number, delta: number) {
    const next = [...enemies];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    enemies = next;
  }
  function reset() {
    allies = Array.from({ length: 4 }, emptySlot);
    enemies = [];
    events = [];
    maxActions = DEFAULT_LIMITS.maxActions;
    maxAV = DEFAULT_LIMITS.maxAV;
    queueStep = 0;
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
      case 'missing-modifier':
        return m.planner_diagnostic_missing_modifier({}, { locale });
      case 'active-target':
        return m.planner_diagnostic_active_target({}, { locale });
      case 'unreached-anchor':
        return m.planner_diagnostic_unreached_anchor({}, { locale });
      case 'no-units':
        return m.planner_diagnostic_no_units({}, { locale });
    }
  }
</script>

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
      <section class="config-section">
        <h2>{m.planner_allies({}, { locale })}</h2>
        <p class="helper">{m.planner_speed_note({}, { locale })}</p>
        {#each allies as unit, index}
          <div class="unit-row" data-testid="ally-slot" data-unit-id={unit.id}>
            <div class="unit-heading">
              <span class="slot-number">0{index + 1}</span>
              <div class="avatar">
                <AssetImage
                  src={avatar(unit.id)}
                  alt={unit.name || m.planner_slot({ position: index + 1 }, { locale })}
                />
              </div>
              <label
                >{m.planner_character({}, { locale })}<select
                  bind:value={unit.characterId}
                  on:change={() => selectCharacter(index)}
                  data-testid="character-select"
                >
                  <option value="">{m.planner_empty_slot({}, { locale })}</option><option
                    value="manual">{m.planner_manual({}, { locale })}</option
                  >
                  {#each characters as character}<option value={character.id}
                      >{character.name}</option
                    >{/each}
                </select></label
              >
            </div>
            {#if unit.characterId}
              {#if unit.characterId === 'manual'}<label
                  >{m.planner_name({}, { locale })}<input
                    bind:value={unit.name}
                    data-testid="unit-name"
                  /></label
                >{/if}
              <div class="speed-fields">
                <label
                  >{m.planner_base_speed({}, { locale })}<input
                    type="number"
                    min="0"
                    step="any"
                    bind:value={unit.baseSpeed}
                    data-testid="base-speed"
                  /></label
                >
                <label
                  >{m.planner_panel_speed({}, { locale })}<input
                    type="number"
                    min="0"
                    step="any"
                    bind:value={unit.panelSpeed}
                    data-testid="panel-speed"
                  /></label
                >
              </div>
              {#if unit.characterId !== 'manual' && !characters.find((character) => character.id === unit.characterId)?.baseSpeed}<p
                  class="helper"
                >
                  {m.planner_missing_speed({}, { locale })}
                </p>{/if}
            {/if}
          </div>
        {/each}
      </section>
      <section class="config-section">
        <h2>{m.planner_enemies({}, { locale })}</h2>
        {#each enemies as unit, index (unit.id)}
          <div class="unit-row" data-testid="enemy-slot">
            <div class="speed-fields">
              <label
                >{m.planner_name({}, { locale })}<input
                  bind:value={unit.name}
                  data-testid="enemy-name"
                /></label
              >
              <label
                >{m.planner_speed({}, { locale })}<input
                  type="number"
                  min="0"
                  step="any"
                  bind:value={unit.panelSpeed}
                  data-testid="enemy-speed"
                /></label
              >
            </div>
            <div class="button-row">
              <button
                type="button"
                disabled={index === 0}
                aria-label={m.planner_up({}, { locale })}
                on:click={() => moveEnemy(index, -1)}>↑</button
              >
              <button
                type="button"
                disabled={index === enemies.length - 1}
                aria-label={m.planner_down({}, { locale })}
                on:click={() => moveEnemy(index, 1)}>↓</button
              >
              <button
                type="button"
                on:click={() => {
                  enemies = enemies.filter((old) => old.id !== unit.id);
                }}>{m.planner_remove({}, { locale })}</button
              >
            </div>
          </div>
        {/each}
        <button
          type="button"
          data-testid="add-enemy"
          disabled={enemies.length >= 4}
          on:click={() => {
            enemies = [...enemies, { ...emptySlot(), characterId: 'manual' }];
          }}>{m.planner_add_enemy({}, { locale })}</button
        >
      </section>
      <section class="config-section">
        <h2>{m.planner_limits({}, { locale })}</h2>
        <div class="speed-fields">
          <label
            >{m.planner_max_actions({}, { locale })}<input
              type="number"
              min="1"
              max={HARD_LIMITS.maxActions}
              step="1"
              bind:value={maxActions}
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
              {#if diagnostic.operationId}<small
                  >{diagnostic.operationId} ·
                </small>{/if}{diagnosticText(diagnostic.code)}
            </li>
          {/each}
        </ul>
      {/if}
      <div class="result-layout">
        <div class="sequence">
          {#if view === 'predict'}
            <div class="action-list" data-testid="action-list">
              <button
                type="button"
                class="action-row system-row"
                class:selected={selectedKey === 'start'}
                data-testid="start-node"
                on:click={() => {
                  selectedAnchor = { kind: 'start' };
                }}
              >
                <span class="slot-number">0</span><span class="system-icon" aria-hidden="true"
                  >✦</span
                ><span class="action-name"
                  ><strong>{m.planner_start({}, { locale })}</strong><small
                    >{m.planner_effect_count(
                      {
                        count:
                          events.find((event) => event.anchor.kind === 'start')?.operations
                            .length ?? 0
                      },
                      { locale }
                    )}</small
                  ></span
                ><span class="av-value">0<small>AV</small></span>
              </button>
              {#each result.records as record, index (anchorKey(record.anchor))}
                <button
                  type="button"
                  class="action-row"
                  class:selected={selectedKey === anchorKey(record.anchor)}
                  data-testid="action-node"
                  data-unit-id={record.anchor.unitId}
                  data-turn={record.anchor.turn}
                  data-total-av={record.elapsedAV}
                  data-delta-av={record.deltaAV}
                  on:click={() => {
                    selectedAnchor = record.anchor;
                  }}
                >
                  <span class="slot-number">{index + 1}</span><span class="avatar"
                    ><AssetImage src={avatar(record.anchor.unitId)} alt="" /></span
                  >
                  <span class="action-name"
                    ><strong>{unitName(record.anchor.unitId)}</strong><small
                      >{m.planner_turn({ turn: record.anchor.turn }, { locale })} · {format(
                        record.effectiveSpeed
                      )} SPD</small
                    ><small
                      >{m.planner_effect_count(
                        {
                          count:
                            events.find(
                              (event) => anchorKey(event.anchor) === anchorKey(record.anchor)
                            )?.operations.length ?? 0
                        },
                        { locale }
                      )}</small
                    ></span
                  >
                  <span class="av-value"
                    >{format(record.elapsedAV)}<small>{m.planner_total_av({}, { locale })}</small
                    ><small>+{format(record.deltaAV)} {m.planner_delta_av({}, { locale })}</small
                    ></span
                  >
                </button>
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
                {m.planner_completed({ count: snapshot.completedActions }, { locale })} · {format(
                  snapshot.elapsedAV
                )} AV
              </p>
              <div class="queue-list" data-testid="queue-list">
                {#each snapshot.queue as entry, index (entry.unitId)}
                  <div
                    class="queue-row"
                    data-testid="queue-unit"
                    data-unit-id={entry.unitId}
                    data-remaining-av={entry.remainingAV}
                  >
                    <span class="slot-number">{index + 1}</span><span class="avatar"
                      ><AssetImage src={avatar(entry.unitId)} alt="" /></span
                    >
                    <div class="action-name">
                      <strong>{entry.name}</strong><small
                        >{m.planner_turn({ turn: entry.turn }, { locale })} · {format(
                          entry.effectiveSpeed
                        )} SPD</small
                      >
                      {#if entry.modifiers.length}<details>
                          <summary
                            >{m.planner_effect_count(
                              { count: entry.modifiers.length },
                              { locale }
                            )}</summary
                          >{#each entry.modifiers as buff}<small
                              >{buff.amount > 0 ? '+' : ''}{buff.amount}{buff.mode === 'percent'
                                ? '%'
                                : ' SPD'} · {m.planner_remaining_turns(
                                { turns: buff.remainingTurns },
                                { locale }
                              )}<br />{buff.id}</small
                            >{/each}
                        </details>{/if}
                    </div>
                    <span class="av-value"
                      >{format(entry.remainingAV)}<small
                        >{m.planner_remaining_av({}, { locale })}</small
                      ></span
                    >
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
          {#if !units.length}<p class="empty">{m.planner_empty({}, { locale })}</p>{/if}
          {#if result.stopReason === 'actions'}<p class="helper">
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
          {#if selectedRecord}<p class="helper">
              {format(selectedRecord.elapsedAV)}
              {m.planner_total_av({}, { locale })}
            </p>{/if}
          {#key selectedKey}<EffectEditor
              {locale}
              anchor={selectedAnchor}
              operations={selectedOperations}
              {units}
              {beforeEffects}
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
  .configuration {
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface);
    padding: var(--space-4);
  }
  .config-section + .config-section {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
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
  select,
  button {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-2) var(--space-3);
    color: var(--text-primary);
    background: var(--surface-2);
    min-width: 0;
  }
  input,
  select {
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
  .unit-row {
    padding: var(--space-4) 0;
    border-top: 1px solid var(--border);
  }
  .unit-heading {
    display: grid;
    grid-template-columns: 1.25rem 2.25rem minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .slot-number {
    color: var(--text-muted);
    font-size: var(--font-helper);
  }
  .avatar {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .avatar :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .speed-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .button-row,
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
    max-height: 48rem;
    overflow-y: auto;
  }
  .action-row,
  .queue-row {
    display: grid;
    grid-template-columns: 1.25rem 2.25rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3) var(--space-2);
    border-radius: 0;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    text-align: left;
  }
  .action-row.selected {
    background: var(--surface-2);
    box-shadow: inset 2px 0 var(--gold);
  }
  .action-row:hover {
    background: var(--surface);
  }
  .system-icon {
    width: 2.25rem;
    text-align: center;
    color: var(--gold);
    font-size: 1.5rem;
  }
  .action-name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .action-name strong {
    font-size: var(--font-meta-value);
  }
  .action-name small,
  .av-value small {
    display: block;
    color: var(--text-secondary);
    font-size: 0.7rem;
    line-height: 1.7;
    font-weight: normal;
  }
  .av-value {
    text-align: right;
    color: var(--gold-soft);
    font-variant-numeric: tabular-nums;
    font-size: var(--font-meta-value);
  }
  .action-name details {
    font-size: var(--font-helper);
    color: var(--text-secondary);
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
