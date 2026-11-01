<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  data-slot="card"
  class={cn(
    'bg-card text-card-foreground border-border flex min-w-0 flex-col gap-6 rounded-xl border py-6 shadow-xs',
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>
