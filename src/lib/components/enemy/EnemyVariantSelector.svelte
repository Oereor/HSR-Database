<script lang="ts">
  import { Command } from 'bits-ui';
  import type { ComponentProps } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { Input } from '$lib/components/ui/input';
  import * as Popover from '$lib/components/ui/popover';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { normalizeSearch, normalizeSearchLabel } from '$lib/search/normalization';
  import EnemyVariantIdentity from './EnemyVariantIdentity.svelte';

  type Variant = ComponentProps<typeof EnemyVariantIdentity>['variant'];

  let {
    variants,
    selected,
    onSelect
  }: {
    variants: Variant[];
    selected: Variant;
    onSelect: (monsterId: string) => void;
  } = $props();

  const id = $props.id();
  const listId = `${id}-options`;
  const triggerWeaknessId = `${id}-weaknesses`;
  const locale = getLocale();
  const variantLabel = m.enemy_specific_units({}, { locale });
  const searchLabel = m.enemy_variant_search({}, { locale });
  const hasMultipleVariants = $derived(variants.length > 1);
  let open = $state(false);
  let query = $state('');
  let trigger = $state<HTMLButtonElement | null>(null);
  let clickedOutside = false;

  function setOpen(next: boolean) {
    open = next;
    if (next) clickedOutside = false;
    else query = '';
  }

  function filter(monsterId: string, search: string, keywords?: string[]) {
    const needle = normalizeSearch(search).replace(/^#/, '');
    return monsterId.includes(needle) || keywords?.some((keyword) => keyword.includes(needle))
      ? 1
      : 0;
  }

  const label = (variant: Variant) => `${gameTextToPlain(variant.name)} · #${variant.monsterId}`;
</script>

<Popover.Root bind:open={() => open, setOpen}>
  <Popover.Trigger
    bind:ref={trigger}
    data-monster-trigger
    aria-label={`${variantLabel} · ${label(selected)}`}
    aria-describedby={selected.weaknesses.length ? triggerWeaknessId : undefined}
    class="border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 flex min-h-14 w-full min-w-0 cursor-pointer items-center rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-3 sm:max-w-xl"
  >
    <EnemyVariantIdentity variant={selected} weaknessId={triggerWeaknessId}>
      <ChevronDown class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
    </EnemyVariantIdentity>
  </Popover.Trigger>

  <Popover.Content
    align="start"
    role="dialog"
    aria-label={variantLabel}
    class="max-h-(--bits-popover-content-available-height) w-[min(var(--bits-popover-anchor-width),var(--bits-popover-content-available-width))] gap-0 overflow-hidden p-0 motion-reduce:animate-none"
    onInteractOutside={() => (clickedOutside = true)}
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      if (!clickedOutside) trigger?.focus({ preventScroll: true });
    }}
  >
    <Command.Root
      {filter}
      label={hasMultipleVariants ? searchLabel : variantLabel}
      value={hasMultipleVariants ? undefined : selected.monsterId}
      disableInitialScroll
      class="flex min-h-0 flex-col"
    >
      {#if hasMultipleVariants}
        <div class="border-border shrink-0 border-b p-2">
          <Command.Input bind:value={query} placeholder={searchLabel}>
            {#snippet child({ props })}
              <Input {...props} bind:value={query} aria-controls={listId} />
            {/snippet}
          </Command.Input>
        </div>

        <Command.Empty class="text-muted-foreground px-2 py-3 text-sm" role="status">
          {m.enemy_variant_search_empty({}, { locale })}
        </Command.Empty>
      {/if}
      <Command.List
        id={listId}
        aria-label={variantLabel}
        class="max-h-72 min-h-0 overflow-y-auto overscroll-contain"
      >
        <Command.Viewport class="p-1">
          {#each variants as variant (variant.monsterId)}
            {@const current = variant.monsterId === selected.monsterId}
            {@const weaknessId = `${id}-weaknesses-${variant.monsterId}`}
            <Command.Item
              value={variant.monsterId}
              keywords={[normalizeSearchLabel(variant.name)]}
              tabindex={hasMultipleVariants ? undefined : 0}
              data-monster-option={variant.monsterId}
              aria-current={current ? 'true' : undefined}
              aria-label={label(variant)}
              aria-describedby={variant.weaknesses.length ? weaknessId : undefined}
              class="aria-current:bg-muted/50 data-selected:bg-accent data-selected:text-accent-foreground hover:bg-accent flex min-h-14 cursor-pointer items-center rounded-sm px-2.5 py-2 text-sm"
              onSelect={() => {
                setOpen(false);
                if (hasMultipleVariants) onSelect(variant.monsterId);
              }}
            >
              <EnemyVariantIdentity {variant} {weaknessId}>
                {#if current}
                  <Check class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {/if}
              </EnemyVariantIdentity>
            </Command.Item>
          {/each}
        </Command.Viewport>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
