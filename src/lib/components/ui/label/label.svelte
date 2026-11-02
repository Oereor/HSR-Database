<script lang="ts">
  import { Label as LabelPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  let { class: className, ...restProps }: LabelPrimitive.RootProps = $props();
</script>

<LabelPrimitive.Root
  data-slot="label"
  class={cn('text-sm leading-none font-medium', className)}
  {...restProps}
/>
