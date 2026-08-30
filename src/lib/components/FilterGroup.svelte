<script lang="ts">
  import FilterChip from './FilterChip.svelte';

  export let label: string;
  export let kind: 'path' | 'element' | 'rarity';
  export let options: Array<{ value: string; label: string }> = [];
  export let selected: Set<string> = new Set();
  export let onToggle: (value: string | undefined) => void;
</script>

<section class="filter-group" aria-labelledby={`filter-group-${kind}`}>
  <h2 id={`filter-group-${kind}`}>{label}</h2>
  <div class="filter-group__chips">
    <FilterChip
      label="全部"
      value="all"
      {kind}
      selected={selected.size === 0}
      on:click={() => onToggle(undefined)}
    />
    {#each options as option (option.value)}
      <FilterChip
        label={option.label}
        value={option.value}
        {kind}
        selected={selected.has(option.value)}
        on:click={() => onToggle(option.value)}
      />
    {/each}
  </div>
</section>

<style>
  .filter-group {
    display: grid;
    gap: 0.65rem;
  }

  .filter-group h2 {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-weight: 700;
  }

  .filter-group__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
