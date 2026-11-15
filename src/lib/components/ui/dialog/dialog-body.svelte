<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="dialog-body"
  class={cn('min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5', className)}
  {...restProps}
>
  {@render children?.()}
</div>
