<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<h3
  data-slot="card-title"
  class={cn('m-0 min-w-0 text-lg leading-snug font-semibold wrap-anywhere', className)}
  {...restProps}
>
  {@render children?.()}
</h3>
