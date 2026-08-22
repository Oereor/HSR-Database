<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameMechanicView } from '$lib/domain/endgame-view';
  import MechanicSurface from '../mechanics/MechanicSurface.svelte';

  export let mechanic: EndgameMechanicView;
</script>

<section class="endgame-mechanics-section" data-endgame-mechanics="memory-turbulence">
  <div class="section-heading"><h2><GameText text={mechanic.name} /></h2></div>
  <MechanicSurface description={mechanic.description} />
</section>
