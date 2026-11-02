<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';
  let { class: className, children, ...restProps }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p
  data-slot="empty-description"
  class={cn('text-muted-foreground m-0 text-sm leading-relaxed wrap-anywhere', className)}
  {...restProps}
>
  {@render children?.()}
</p>
