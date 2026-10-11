<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import type { CharacterSlotDraft } from '$lib/action-planner/character-selection';
  import type { PlannerCharacterOption } from '$lib/action-planner/types';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';

  export let locale: Locale;
  export let slot: CharacterSlotDraft;
  export let position: number;
  export let character: PlannerCharacterOption | undefined;
  export let onOpen: () => void;
  export let onRemove: () => void;
  let trigger: HTMLButtonElement;
  export function focusTrigger() {
    trigger?.focus();
  }
</script>

<div
  class="character-slot"
  class:empty={!character}
  data-testid="ally-slot"
  data-unit-id={slot.id}
  data-slot-index={position}
>
  {#if character}
    <button
      type="button"
      class="portrait"
      on:click={onOpen}
      aria-label={m.planner_change_character({ name: character.name }, { locale })}
    >
      <AssetImage src={getCharacterIconUrl(character.avatarId)} alt={character.name} />
    </button>
    <div class="slot-details">
      <div class="name-row">
        <button
          type="button"
          class="name"
          bind:this={trigger}
          on:click={onOpen}
          data-testid="character-trigger"
          aria-haspopup="dialog">{character.name}</button
        >
        <button
          type="button"
          class="remove"
          on:click={onRemove}
          data-testid="remove-character"
          aria-label={m.planner_remove_character({ name: character.name }, { locale })}>×</button
        >
      </div>
      <div class="speed-fields">
        <label
          >{m.planner_base_speed({}, { locale })}<input
            type="number"
            min="0"
            step="any"
            bind:value={slot.baseSpeed}
            data-testid="base-speed"
          /></label
        >
        <label
          >{m.planner_panel_speed({}, { locale })}<input
            type="number"
            min="0"
            step="any"
            bind:value={slot.panelSpeed}
            data-testid="panel-speed"
          /></label
        >
      </div>
    </div>
    {#if character.baseSpeed === undefined}
      <p class="missing-speed">{m.planner_missing_speed({}, { locale })}</p>
    {/if}
  {:else}
    <button
      type="button"
      class="empty-slot"
      bind:this={trigger}
      on:click={onOpen}
      data-testid="character-trigger"
      aria-haspopup="dialog"
      aria-label={m.planner_add_to_slot({ position: position + 1 }, { locale })}
    >
      <span class="placeholder" aria-hidden="true">+</span>
      <span>{m.planner_add_character({}, { locale })}</span>
    </button>
  {/if}
</div>

<style>
  .character-slot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface);
  }
  .character-slot.empty {
    padding: 0;
  }
  button {
    cursor: pointer;
    color: var(--text-primary);
    font: inherit;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
  }
  .portrait,
  .placeholder {
    width: 4rem;
    height: 4rem;
    flex: 0 0 4rem;
    border-radius: var(--radius-control);
    overflow: hidden;
    background: var(--surface-3);
  }
  .portrait {
    padding: 0;
    border: 1px solid transparent;
  }
  .portrait:hover {
    border-color: var(--gold);
  }
  .portrait :global(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .slot-details {
    flex: 1;
    min-width: 0;
  }
  .name-row {
    display: flex;
    gap: var(--space-2);
    align-items: start;
  }
  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-weight: 650;
    overflow-wrap: anywhere;
    background: none;
    border: 0;
    padding: 0;
  }
  .name:hover {
    color: var(--gold);
  }
  .remove {
    border: 0;
    background: none;
    padding: 0 var(--space-1);
    color: var(--text-muted);
  }
  .remove:hover {
    color: var(--text-primary);
  }
  .speed-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  label {
    display: grid;
    gap: var(--space-1);
    color: var(--text-secondary);
    font-size: var(--font-helper);
    min-width: 0;
  }
  input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-2);
    background: var(--surface-2);
    color: var(--text-primary);
  }
  .empty-slot {
    display: flex;
    width: 100%;
    align-items: center;
    gap: var(--space-3);
    border: 0;
    padding: var(--space-3);
    background: none;
    color: var(--text-secondary);
    text-align: left;
    min-height: 5rem;
  }
  .placeholder {
    display: grid;
    place-items: center;
    border: 1px dashed var(--border);
    font-size: 1.75rem;
  }
  .empty-slot:hover {
    color: var(--gold);
  }
  .empty-slot:hover .placeholder {
    border-color: var(--gold);
  }
  .missing-speed {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--font-helper);
    color: var(--text-secondary);
  }
</style>
