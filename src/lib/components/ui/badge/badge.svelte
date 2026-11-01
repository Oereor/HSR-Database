<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let { class: className, children, ...restProps }: HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span
  data-slot="badge"
  class={cn(
    'border-border bg-secondary text-secondary-foreground inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
    className
  )}
  {...restProps}>{@render children?.()}</span
>
