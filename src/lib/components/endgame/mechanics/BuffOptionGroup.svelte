<script lang="ts">
  import InlineDividerHeading from '$lib/components/InlineDividerHeading.svelte';
  import type { EndgameOrderedMechanicView } from '$lib/domain/endgame-view';
  import BuffOptionTile from './BuffOptionTile.svelte';

  export let title: string;
  export let options: EndgameOrderedMechanicView[];
  export let headingLevel: 2 | 3 | 4 = 2;
  export let headingScale: 'large' | 'medium' | 'small' = 'large';

  $: optionHeadingLevel = Math.min(headingLevel + 1, 5) as 3 | 4 | 5;
</script>

<div class="buff-option-group" data-buff-option-group>
  <div class="buff-option-group__heading">
    <InlineDividerHeading level={headingLevel} scale={headingScale}>{title}</InlineDividerHeading>
  </div>
  <div class="buff-option-group__grid" data-buff-option-grid>
    {#each options as option (option.order)}
      <BuffOptionTile {option} headingLevel={optionHeadingLevel} />
    {/each}
  </div>
</div>

<style>
  .buff-option-group {
    min-width: 0;
  }

  .buff-option-group__heading {
    margin-bottom: var(--space-4);
  }

  .buff-option-group__grid {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    align-items: stretch;
  }

  @container endgame-main (min-width: 620px) {
    .buff-option-group__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container endgame-main (min-width: 860px) {
    .buff-option-group__grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
