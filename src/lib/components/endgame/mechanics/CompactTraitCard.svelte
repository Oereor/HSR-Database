<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameMechanicView } from '$lib/domain/endgame-view';

  export let trait: EndgameMechanicView;
</script>

<article class="endgame-trait-card">
  <h3><GameText text={trait.name} /></h3>
  <p><GameText text={trait.description} /></p>
</article>
