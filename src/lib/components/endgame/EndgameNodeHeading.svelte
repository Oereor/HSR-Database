<script lang="ts">
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import { formatChineseOrdinal } from './presentation';
  import { m } from '$lib/paraglide/messages.js';

  export let slot: number;
</script>

<SectionHeading level={2} headingLevel={3}
  >{m.endgame_node({ number: formatChineseOrdinal(slot) })}</SectionHeading
>
