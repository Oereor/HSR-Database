<script lang="ts">
  import { Separator as SeparatorPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  let {
    ref = $bindable(null),
    class: className,
    orientation = 'horizontal',
    decorative = true,
    ...restProps
  }: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root
  bind:ref
  data-slot="separator"
  {orientation}
  {decorative}
  class={cn(
    'bg-border shrink-0 data-horizontal:h-px data-horizontal:w-full data-vertical:h-full data-vertical:w-px',
    className
  )}
  {...restProps}
/>
