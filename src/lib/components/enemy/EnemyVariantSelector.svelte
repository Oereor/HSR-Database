<script lang="ts">
  import { Combobox } from 'bits-ui';
  import Check from '@lucide/svelte/icons/check';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import { Input } from '$lib/components/ui/input';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import type { EnemyVariantIdentity } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { normalizeSearch, normalizeSearchLabel } from '$lib/search/normalization';

  let {
    variants,
    selected,
    onSelect
  }: {
    variants: EnemyVariantIdentity[];
    selected: EnemyVariantIdentity;
    onSelect: (monsterId: string) => void;
  } = $props();

  let open = $state(false);
  let query = $state('');
  const locale = getLocale();
  const label = ({ name, monsterId }: EnemyVariantIdentity) =>
    `${gameTextToPlain(name)} · #${monsterId}`;
  const options = $derived(
    variants.map((variant) => ({
      ...variant,
      searchName: normalizeSearchLabel(variant.name)
    }))
  );
  const needle = $derived(normalizeSearch(query.trim().replace(/^#/, '')));
  const matches = $derived(
    options.filter(
      ({ searchName, monsterId }) => searchName.includes(needle) || monsterId.includes(needle)
    )
  );
</script>

<Combobox.Root
  type="single"
  bind:open
  value={selected.monsterId}
  inputValue={open ? query : label(selected)}
  allowDeselect={false}
  onOpenChange={(next) => {
    if (!next) query = '';
  }}
  onValueChange={onSelect}
>
  <div class="relative mt-4 w-full sm:max-w-md">
    <Combobox.Input
      aria-label={m.enemy_specific_units({}, { locale })}
      placeholder={m.enemy_variant_search({}, { locale })}
      onclick={() => (open = true)}
      oninput={(event) => {
        query = event.currentTarget.value;
        open = true;
      }}
    >
      {#snippet child({ props })}
        <Input {...props} class="h-10 pr-10" />
      {/snippet}
    </Combobox.Input>
    <Combobox.Trigger
      aria-label={m.enemy_specific_units({}, { locale })}
      class="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 grid w-10 place-items-center rounded-md focus-visible:ring-2"
    >
      <ChevronsUpDown class="size-4" aria-hidden="true" />
    </Combobox.Trigger>
  </div>

  <Combobox.Portal>
    <Combobox.Content
      sideOffset={4}
      class="bg-popover text-popover-foreground border-border z-50 w-[var(--bits-floating-anchor-width)] overflow-hidden rounded-md border shadow-md"
    >
      <Combobox.Viewport
        class="max-h-[min(18rem,var(--bits-floating-available-height))] overflow-y-auto overscroll-contain p-1"
      >
        {#each matches as variant (variant.monsterId)}
          <Combobox.Item
            value={variant.monsterId}
            label={label(variant)}
            data-monster-option={variant.monsterId}
            class="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
          >
            <span class="min-w-0 flex-1 wrap-anywhere"><GameText text={variant.name} /></span>
            <span class="text-muted-foreground shrink-0 tabular-nums">#{variant.monsterId}</span>
            {#if selected.monsterId === variant.monsterId}<Check
                class="size-4 shrink-0"
                aria-hidden="true"
              />{/if}
          </Combobox.Item>
        {:else}
          <p class="text-muted-foreground px-2 py-3 text-sm" role="status">
            {m.enemy_variant_search_empty({}, { locale })}
          </p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
