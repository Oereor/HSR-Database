<script lang="ts">
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import { formatChineseOrdinal } from './presentation';

  export let slot: number;
</script>

<SectionHeading level={2} headingLevel={3}>节点{formatChineseOrdinal(slot)}</SectionHeading>
