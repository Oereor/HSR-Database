<script lang="ts">
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { m } from '$lib/paraglide/messages.js';

  export let slot: number;
</script>

<SectionHeading level={2} headingLevel={3}>{m.endgame_node({ number: slot })}</SectionHeading>
