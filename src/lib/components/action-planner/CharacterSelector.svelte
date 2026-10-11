<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import { createCharacterSearch } from '$lib/action-planner/character-selection';
  import type { PlannerCharacterOption } from '$lib/action-planner/types';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';

  export let locale: Locale;
  export let characters: PlannerCharacterOption[];
  export let open = false;
  export let selectedId = '';
  export let occupiedIds: string[] = [];
  export let onSelect: (character: PlannerCharacterOption) => void;
  export let onRequestClose: () => void;
  export let onClosed: () => void;
  let dialog: HTMLDialogElement;
  let surface: HTMLElement;
  let searchInput: HTMLInputElement;
  let query = '';
  let synchronizedOpen = false;
  let previousBodyOverflow = '';
  let previousRootOverflow = '';
  let locked = false;
  $: search = createCharacterSearch(characters);
  $: results = search(query);
  $: if (dialog && open !== synchronizedOpen) synchronize(open);

  async function synchronize(nextOpen: boolean) {
    synchronizedOpen = nextOpen;
    if (!nextOpen) {
      if (dialog.open) dialog.close();
      return;
    }
    query = '';
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    locked = true;
    dialog.showModal();
    await tick();
    if (open) searchInput?.focus();
  }
  function unlock() {
    if (!locked) return;
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousRootOverflow;
    locked = false;
  }
  function cancel(event: Event) {
    event.preventDefault();
    onRequestClose();
  }
  function searchKeydown(event: KeyboardEvent) {
    // Chromium's search input otherwise consumes the first Escape to clear its value.
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onRequestClose();
  }
  function backdrop(event: MouseEvent) {
    if (event.target !== dialog) return;
    const bounds = surface.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      onRequestClose();
  }
  function closed() {
    unlock();
    onClosed();
  }
  onDestroy(unlock);
</script>

<dialog
  bind:this={dialog}
  class="character-selector"
  aria-labelledby="character-selector-title"
  data-testid="character-selector"
  on:cancel={cancel}
  on:close={closed}
  on:click={backdrop}
>
  <section class="selector-surface" bind:this={surface}>
    <header>
      <h2 id="character-selector-title">{m.planner_select_character({}, { locale })}</h2>
      <button
        type="button"
        class="close"
        on:click={onRequestClose}
        data-testid="close-selector"
        aria-label={m.planner_close_selector({}, { locale })}>×</button
      >
    </header>
    <label class="search-label">
      <span class="sr-only">{m.planner_search_characters({}, { locale })}</span>
      <input
        type="search"
        bind:value={query}
        bind:this={searchInput}
        data-testid="character-search"
        placeholder={m.planner_search_characters({}, { locale })}
        autocomplete="off"
        on:keydown={searchKeydown}
      />
    </label>
    <div class="grid-scroll">
      {#if results.length}
        <div class="character-grid">
          {#each results as character (character.id)}
            {@const occupied = occupiedIds.includes(character.id)}
            <button
              type="button"
              class="character-option"
              class:selected={selectedId === character.id}
              disabled={occupied}
              aria-pressed={selectedId === character.id}
              aria-label={occupied
                ? m.planner_character_occupied({ name: character.name }, { locale })
                : character.name}
              title={occupied
                ? m.planner_character_occupied({ name: character.name }, { locale })
                : character.name}
              data-testid="character-option"
              data-character-id={character.id}
              on:click={() => onSelect(character)}
            >
              <AssetImage
                src={getCharacterIconUrl(character.avatarId)}
                alt={character.name}
                loading="lazy"
              />
            </button>
          {/each}
        </div>
      {:else}
        <p class="no-results" role="status" data-testid="character-no-results">
          {m.planner_no_characters({}, { locale })}
        </p>
      {/if}
    </div>
  </section>
</dialog>

<style>
  .character-selector {
    margin: auto;
    width: min(42rem, calc(100vw - 2rem));
    max-width: none;
    max-height: 85dvh;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    color: var(--text-primary);
    background: var(--surface);
  }
  .character-selector::backdrop {
    background: rgb(0 0 0 / 55%);
  }
  .selector-surface {
    display: flex;
    flex-direction: column;
    max-height: 85dvh;
    padding: var(--space-4);
    gap: var(--space-4);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }
  h2 {
    margin: 0;
    font-size: var(--font-major-title);
  }
  button,
  input {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    color: var(--text-primary);
  }
  button {
    cursor: pointer;
  }
  .close {
    padding: var(--space-1) var(--space-3);
    font-size: 1.25rem;
  }
  .search-label {
    display: block;
  }
  input {
    width: 100%;
    padding: var(--space-3);
  }
  .grid-scroll {
    overflow-y: auto;
    min-height: 0;
    padding: var(--space-1);
  }
  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4rem, 1fr));
    gap: var(--space-3);
  }
  .character-option {
    aspect-ratio: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    border-width: 2px;
  }
  .character-option :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .character-option.selected,
  button:hover:not(:disabled) {
    border-color: var(--gold);
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .character-option:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .no-results {
    color: var(--text-secondary);
    text-align: center;
    padding: var(--space-6);
  }
  @media (max-width: 520px) {
    .selector-surface {
      padding: var(--space-3);
    }
    .character-grid {
      gap: var(--space-2);
    }
  }
</style>
