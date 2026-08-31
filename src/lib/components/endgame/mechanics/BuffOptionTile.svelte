<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameOrderedMechanicView } from '$lib/domain/endgame-view';

  export let option: EndgameOrderedMechanicView;
  export let headingLevel: 3 | 4 | 5 = 3;

  $: headingTag = `h${headingLevel}` as const;
</script>

<article class="buff-option-tile" data-buff-option-tile>
  <svelte:element this={headingTag}><GameText text={option.name} /></svelte:element>
  <p><GameText text={option.description} /></p>
</article>

<style>
  .buff-option-tile {
    min-width: 0;
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-card);
    background: rgb(14 20 34 / 64%);
    padding: var(--space-4);
  }

  .buff-option-tile h3,
  .buff-option-tile h4,
  .buff-option-tile h5 {
    margin: 0 0 var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-major-title);
    font-weight: 650;
    line-height: 1.35;
  }

  .buff-option-tile p {
    margin: 0;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.7;
  }
</style>
