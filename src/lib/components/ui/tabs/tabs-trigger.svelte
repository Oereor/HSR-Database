<script lang="ts">
  import { Tabs } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'card',
    ...props
  }: Tabs.TriggerProps & { variant?: 'card' | 'underline' } = $props();
</script>

<Tabs.Trigger
  bind:ref
  data-slot="tabs-trigger"
  class={cn(
    variant === 'card'
      ? 'selection-card'
      : 'text-muted-foreground hover:text-foreground aria-selected:text-foreground aria-selected:border-primary focus-visible:outline-ring min-h-11 min-w-11 border-b-2 border-transparent px-2 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-4',
    className
  )}
  {...props}
/>
