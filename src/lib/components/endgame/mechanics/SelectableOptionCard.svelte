<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameOrderedMechanicView } from '$lib/domain/endgame-view';

  export let option: EndgameOrderedMechanicView;
  export let headingLevel: 3 | 5 = 3;

  $: headingTag = `h${headingLevel}` as const;
</script>

<article class="endgame-option-card">
  <svelte:element this={headingTag}><GameText text={option.name} /></svelte:element>
  <p><GameText text={option.description} /></p>
</article>
