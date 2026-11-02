<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="alert-description"
  class={cn('text-sm leading-relaxed wrap-anywhere', className)}
  {...restProps}
>
  {@render children?.()}
</div>
