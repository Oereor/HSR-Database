<script lang="ts">
  import type { EndgameMechanicView } from '$lib/domain/endgame-view';
  import MechanicSectionCard from '../mechanics/MechanicSectionCard.svelte';

  export let mechanic: EndgameMechanicView;
</script>

<section class="endgame-mechanics-section" data-endgame-mechanics="memory-turbulence">
  <MechanicSectionCard
    title={mechanic.name}
    content={{ kind: 'description', description: mechanic.description }}
    headingLevel={2}
  />
</section>
