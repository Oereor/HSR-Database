<script lang="ts">
  import type { EndgameMechanicView } from '$lib/domain/endgame-view';
  import MechanicSurface from '../mechanics/MechanicSurface.svelte';

  export let mechanic: EndgameMechanicView;
</script>

<section class="endgame-mechanics-section" data-endgame-mechanics="memory-turbulence">
  <MechanicSurface
    title={mechanic.name}
    description={mechanic.description}
    headingLevel={2}
    accent
  />
</section>
