<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<nav
  bind:this={ref}
  data-slot="pagination"
  class={cn('mx-auto flex w-full justify-center', className)}
  {...restProps}
>
  {@render children?.()}
</nav>
