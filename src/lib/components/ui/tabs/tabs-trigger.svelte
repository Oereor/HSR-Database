<script lang="ts">
  import { Tabs } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let { ref = $bindable(null), class: className, ...props }: Tabs.TriggerProps = $props();
</script>

<Tabs.Trigger
  bind:ref
  data-slot="tabs-trigger"
  class={cn('selection-card', className)}
  {...props}
/>
