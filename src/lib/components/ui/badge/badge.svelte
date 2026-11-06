<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    class: className,
    children,
    variant = 'secondary',
    ...restProps
  }: HTMLAttributes<HTMLSpanElement> & {
    variant?: 'default' | 'secondary' | 'outline' | 'destructive';
  } = $props();
</script>

<span
  data-slot="badge"
  class={cn(
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-[0.375rem] border px-2 py-0.5 text-xs font-medium',
    variant === 'outline'
      ? 'border-border text-foreground bg-transparent'
      : variant === 'default'
        ? 'bg-primary text-primary-foreground border-transparent'
        : variant === 'destructive'
          ? 'bg-destructive/10 text-destructive border-transparent'
          : 'border-border bg-secondary text-secondary-foreground',
    className
  )}
  {...restProps}>{@render children?.()}</span
>
