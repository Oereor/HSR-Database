<script lang="ts">
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import type { EndgameOrderedMechanicView } from '$lib/domain/endgame-view';
  import BuffOptionTile from './BuffOptionTile.svelte';

  export let title: string;
  export let options: EndgameOrderedMechanicView[];
  export let headingLevel: 2 | 3 | 4 = 2;
  export let level: 1 | 2 | 3 = 1;

  $: optionHeadingLevel = Math.min(headingLevel + 1, 5) as 3 | 4 | 5;
</script>

<div class="buff-option-group min-w-0" data-buff-option-group>
  <SectionHeading {level} {headingLevel}>{title}</SectionHeading>
  <div
    class="buff-option-group__grid grid min-w-0 grid-cols-1 items-stretch gap-3 @min-[620px]/endgame-main:grid-cols-2 @min-[860px]/endgame-main:grid-cols-3"
    data-buff-option-grid
  >
    {#each options as option (option.order)}
      <BuffOptionTile {option} headingLevel={optionHeadingLevel} />
    {/each}
  </div>
</div>
