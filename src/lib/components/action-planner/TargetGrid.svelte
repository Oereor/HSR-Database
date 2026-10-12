<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import type { UnitConfig } from '$lib/action-planner/types';
  export let units: UnitConfig[];
  export let selectedIds: string[];
  export let avatar: (id: string) => string | undefined;
  export let onToggle: (id: string) => void;
  export let testId = 'effect-target';
</script>

<div class="target-grid">
  {#each units as unit (unit.id)}
    <button
      type="button"
      title={unit.name}
      aria-label={unit.name}
      aria-pressed={selectedIds.includes(unit.id)}
      data-testid={testId}
      data-unit-id={unit.id}
      on:click={() => onToggle(unit.id)}
    >
      <span class="avatar"><AssetImage src={avatar(unit.id)} alt="" /></span>
      <span class="name">{unit.name}</span>
    </button>
  {/each}
</div>

<style>
  .target-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(3.25rem, 1fr));
    gap: var(--space-2);
  }
  button {
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-2) var(--space-1);
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
  }
  button:hover {
    border-color: var(--gold);
  }
  button[aria-pressed='true'] {
    border-color: var(--gold);
    background: var(--surface-2);
    color: var(--gold-soft);
    box-shadow: inset 0 -2px var(--gold);
  }
  button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-control);
    overflow: hidden;
    background: var(--surface-3);
    display: grid;
    place-items: center;
  }
  .avatar :global(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .name {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--font-helper);
  }
</style>
