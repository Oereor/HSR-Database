<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';
  import CheckIcon from '@lucide/svelte/icons/check';
  import { cn } from '$lib/utils.js';
  let {
    ref = $bindable(null),
    class: className,
    children: itemChildren,
    ...restProps
  }: SelectPrimitive.ItemProps = $props();
</script>

<SelectPrimitive.Item
  bind:ref
  data-slot="select-item"
  class={cn(
    'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    className
  )}
  {...restProps}
>
  {#snippet children({ selected, highlighted })}
    {@render itemChildren?.({ selected, highlighted })}
    {#if selected}<CheckIcon class="absolute right-2 size-4" aria-hidden="true" />{/if}
  {/snippet}
</SelectPrimitive.Item>
