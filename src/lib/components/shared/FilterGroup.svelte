<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { Toggle } from '$lib/components/ui/toggle';
  import RarityStars from './RarityStars.svelte';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { getElementIconUrl, getPathIconUrl } from '$lib/data/visual-assets';

  export let id: string;
  export let label: string;
  export let iconKind: 'path' | 'element' | undefined = undefined;
  export let options: Array<{ value: string; label: string }> = [];
  export let selected: Set<string> = new Set();
  export let multiple = true;
  export let presentation: 'default' | 'rarity' = 'default';
  export let onToggle: (value: string | undefined) => void;
  $: values = [...selected];
  function updateSelection(next: string[]) {
    const changed =
      next.find((value) => !selected.has(value)) ??
      [...selected].find((value) => !next.includes(value));
    if (changed !== undefined) onToggle(changed);
  }
</script>

<section class="filter-group grid min-w-0 gap-2" aria-labelledby={`filter-group-${id}`}>
  <h2 class="text-muted-foreground m-0 text-sm font-medium" id={`filter-group-${id}`}>{label}</h2>
  <div class="flex flex-wrap items-start gap-2">
    <Toggle
      variant="outline"
      size="sm"
      pressed={selected.size === 0}
      data-filter-value="all"
      onclick={(event) => {
        if (selected.size === 0) event.preventDefault();
        onToggle(undefined);
      }}>{m.filter_all()}</Toggle
    >
    {#snippet optionsList()}
      {#each options as option (option.value)}
        {@const icon =
          iconKind === 'path'
            ? getPathIconUrl(option.value)
            : iconKind === 'element'
              ? getElementIconUrl(option.value)
              : undefined}
        <ToggleGroup.Item
          onclick={(event) => {
            if (!multiple && selected.has(option.value)) event.preventDefault();
          }}
          aria-label={presentation === 'rarity'
            ? m.rarity_aria({ rarity: Number(option.value) })
            : undefined}
          value={option.value}
          data-filter-value={option.value}
          style={iconKind === 'element' ? `color: ${getElementColor(option.value)}` : undefined}
        >
          {#if icon}<AssetImage
              decorative
              src={icon}
              alt=""
              aria-hidden="true"
              width="18"
              height="18"
            />{/if}
          {#if presentation === 'rarity'}
            <span aria-hidden="true"
              ><RarityStars rarity={Number(option.value)} size="compact" /></span
            >
          {:else}
            <span>{option.label}</span>
          {/if}
        </ToggleGroup.Item>
      {/each}
    {/snippet}
    {#if multiple}
      <ToggleGroup.Root
        type="multiple"
        value={values}
        onValueChange={updateSelection}
        variant="outline"
        size="sm"
        spacing={2}
        class="flex-wrap justify-start"
        aria-labelledby={`filter-group-${id}`}>{@render optionsList()}</ToggleGroup.Root
      >
    {:else}
      <ToggleGroup.Root
        type="single"
        value={values[0] ?? ''}
        onValueChange={(value) => {
          if (value) onToggle(value);
        }}
        variant="outline"
        size="sm"
        spacing={2}
        class="flex-wrap justify-start"
        aria-labelledby={`filter-group-${id}`}>{@render optionsList()}</ToggleGroup.Root
      >
    {/if}
  </div>
</section>
