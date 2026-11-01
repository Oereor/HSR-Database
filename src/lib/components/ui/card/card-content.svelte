<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<div
  data-slot="card-content"
  class={cn('min-w-0 px-6 group-data-[size=sm]/card:px-4', className)}
  {...restProps}
>
  {@render children?.()}
</div>
