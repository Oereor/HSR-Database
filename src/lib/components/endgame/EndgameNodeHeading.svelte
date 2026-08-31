<script lang="ts">
  import InlineDividerHeading from '$lib/components/InlineDividerHeading.svelte';
  import { formatChineseOrdinal } from './presentation';

  export let slot: number;
</script>

<InlineDividerHeading level={3} scale="medium">
  节点{formatChineseOrdinal(slot)}
</InlineDividerHeading>
