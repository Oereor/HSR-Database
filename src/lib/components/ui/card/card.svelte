<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    ref = $bindable(null),
    class: className,
    children,
    size = 'default',
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: 'default' | 'sm' } = $props();
</script>

<div
  bind:this={ref}
  data-slot="card"
  data-size={size}
  class={cn(
    'group/card bg-card text-card-foreground border-border flex min-w-0 flex-col rounded-xl border shadow-xs',
    size === 'sm' ? 'gap-4 py-4' : 'gap-6 py-6',
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>
