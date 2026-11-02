<script lang="ts">
  import type { HTMLLiAttributes } from 'svelte/elements';
  let { children, ...restProps }: HTMLLiAttributes = $props();
</script>

<li data-slot="pagination-item" {...restProps}>{@render children?.()}</li>
