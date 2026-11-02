<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import { cn } from '$lib/utils.js';
  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: SelectPrimitive.TriggerProps = $props();
</script>

<SelectPrimitive.Trigger
  bind:ref
  data-slot="select-trigger"
  class={cn(
    'border-input bg-input/30 text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-fit items-center justify-between gap-2 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0',
    className
  )}
  {...restProps}
>
  {@render children?.()}
  <ChevronDownIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
</SelectPrimitive.Trigger>
