<script lang="ts" generics="Props extends Record<string, unknown>">
  import type { Component } from 'svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  let { component: Subject, props }: { component: Component<Props>; props: Props } = $props();
</script>

<Tooltip.Provider>
  <Subject {...props} />
</Tooltip.Provider>
