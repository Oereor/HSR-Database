<script lang="ts">
  import type { EndgameMechanicView } from '$lib/domain/endgame-view';
  import MechanicSectionCard from '../mechanics/MechanicSectionCard.svelte';

  export let mechanic: EndgameMechanicView;

  $: content = { kind: 'description' as const, description: mechanic.description };
</script>

<section class="endgame-mechanics-section" data-endgame-mechanics="aftertaste">
  <MechanicSectionCard title={mechanic.name} {content} headingLevel={2} />
</section>
