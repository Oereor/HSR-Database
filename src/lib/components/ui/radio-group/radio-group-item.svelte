<script lang="ts">
  import { RadioGroup } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let { ref = $bindable(null), class: className, ...props }: RadioGroup.ItemProps = $props();
</script>

<RadioGroup.Item
  bind:ref
  data-slot="radio-group-item"
  class={cn('selection-card', className)}
  {...props}
/>
