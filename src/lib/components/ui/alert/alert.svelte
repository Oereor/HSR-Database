<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    ref = $bindable(null),
    class: className,
    children,
    variant = 'default',
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    variant?: 'default' | 'destructive';
  } = $props();
</script>

<div
  bind:this={ref}
  data-slot="alert"
  role="alert"
  class={cn(
    'relative grid w-full min-w-0 gap-0.5 rounded-lg border px-4 py-3 text-sm',
    variant === 'destructive'
      ? 'bg-card text-destructive border-destructive/30'
      : 'bg-card text-card-foreground border-border',
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>
