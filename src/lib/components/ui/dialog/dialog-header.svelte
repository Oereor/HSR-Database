<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<header
  data-slot="dialog-header"
  class={cn(
    'border-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6',
    className
  )}
  {...restProps}
>
  {@render children?.()}
</header>
