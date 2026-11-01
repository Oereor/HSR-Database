<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    ...restProps
  }: SelectPrimitive.ContentProps = $props();
</script>

<SelectPrimitive.Portal>
  <SelectPrimitive.Content
    bind:ref
    data-slot="select-content"
    {sideOffset}
    class={cn(
      'bg-popover text-popover-foreground border-border data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 relative z-50 max-h-(--bits-select-content-available-height) min-w-(--bits-select-anchor-width) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md',
      className
    )}
    {...restProps}
  />
</SelectPrimitive.Portal>
