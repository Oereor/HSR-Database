<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
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

<div
  class="overview-toolbar border-border text-muted-foreground flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"
>
  <span>{m.overview_result_count({ count: resultCount })}</span>
  <div class="flex min-w-0 flex-wrap items-center gap-3">
    {#if hasFilters}<Button variant="ghost" size="sm" onclick={onClearFilters}
        >{m.overview_clear_active_filters()}</Button
      >{/if}
    <div class="overview-toolbar__sort flex items-center gap-2">
      <span class="text-sm font-medium">{m.overview_sort()}</span>
      <Select.Root
        type="single"
        value={sort}
        items={sortOptions}
        onValueChange={(value) => {
          if (value && value !== sort) void onSortChange(value);
        }}
      >
        <Select.Trigger aria-label={m.overview_sort()} class="min-w-28">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {#each sortOptions as option (option.value)}<Select.Item
              value={option.value}
              label={option.label}>{option.label}</Select.Item
            >{/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>
</div>
