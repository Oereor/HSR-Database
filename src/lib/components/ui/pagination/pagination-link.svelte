<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { buttonVariants, type ButtonSize } from '$lib/components/ui/button';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  let {
    class: className,
    isActive = false,
    size = 'icon',
    children,
    ...restProps
  }: HTMLAnchorAttributes & { isActive?: boolean; size?: ButtonSize } = $props();
</script>

<a
  data-slot="pagination-link"
  aria-current={isActive ? 'page' : undefined}
  class={cn(buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }), className)}
  {...restProps}
>
  {@render children?.()}
</a>
