<script lang="ts">
  export let resultCount = 0;
  export let hasFilters = false;
  export let sort = 'rarity';
  export let sortOptions: Array<{ value: string; label: string }> = [
    { value: 'rarity', label: '稀有度' },
    { value: 'name', label: '名称' },
    { value: 'id', label: 'ID' }
  ];
  export let onClearFilters: () => void | Promise<void>;
  export let onSortChange: (value: string) => void | Promise<void>;
</script>

<div class="overview-toolbar">
  <span>共 {resultCount} 个结果</span>
  {#if hasFilters}
    <button type="button" class="button button--quiet" on:click={onClearFilters}>清除筛选</button>
  {/if}
  <label class="overview-toolbar__sort">
    <span>排序</span>
    <select
      value={sort}
      aria-label="排序"
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
