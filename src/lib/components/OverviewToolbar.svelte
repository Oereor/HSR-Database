<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  export let resultCount = 0;
  export let hasFilters = false;
  export let sort = 'rarity';
  export let sortOptions: Array<{ value: string; label: string }> = [
    { value: 'rarity', label: m.overview_sort_rarity() },
    { value: 'name', label: m.overview_sort_name() },
    { value: 'id', label: m.overview_sort_id() }
  ];
  export let onClearFilters: () => void | Promise<void>;
  export let onSortChange: (value: string) => void | Promise<void>;
</script>

<div class="overview-toolbar">
  <span>{m.overview_result_count({ count: resultCount })}</span>
  {#if hasFilters}
    <button type="button" class="button button--quiet" on:click={onClearFilters}
      >{m.overview_clear_active_filters()}</button
    >
  {/if}
  <label class="overview-toolbar__sort">
    <span>{m.overview_sort()}</span>
    <select
      value={sort}
      aria-label={m.overview_sort()}
      on:change={(event) => onSortChange((event.currentTarget as HTMLSelectElement).value)}
    >
      {#each sortOptions as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>
</div>

<style>
  .overview-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    color: var(--text-muted);
    font-size: var(--font-helper);
  }

  .overview-toolbar__sort {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .overview-toolbar__sort > span {
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-weight: 700;
  }

  .overview-toolbar__sort select {
    padding: 0.42rem 0.55rem;
    font-size: var(--font-helper);
  }
</style>
