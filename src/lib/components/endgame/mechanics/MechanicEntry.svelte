<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameMechanicView } from '$lib/domain/endgame-view';

  export let mechanic: EndgameMechanicView;
  export let headingLevel: 3 | 4 | 5 = 3;

  $: headingTag = `h${headingLevel}` as const;
</script>

<article class="endgame-mechanic-entry">
  <svelte:element this={headingTag} class="endgame-mechanic-entry__title">
    <GameText text={mechanic.name} />
  </svelte:element>
  <p><GameText text={mechanic.description} /></p>
  <slot />
</article>
