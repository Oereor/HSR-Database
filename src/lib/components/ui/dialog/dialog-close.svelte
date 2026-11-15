<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui';
  import XIcon from '@lucide/svelte/icons/x';
  import { Button } from '$lib/components/ui/button/index.js';

  let { label, class: className }: { label: string; class?: string } = $props();
</script>

<DialogPrimitive.Close data-slot="dialog-close" aria-label={label}>
  {#snippet child({ props })}
    <Button variant="ghost" size="icon" class={className} {...props}>
      <XIcon aria-hidden="true" />
    </Button>
  {/snippet}
</DialogPrimitive.Close>
