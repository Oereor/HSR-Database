<script lang="ts">
  import type { ElementLabel } from '$lib/domain/types';
  import { getElementColor } from '$lib/domain/elements';
  import SemanticIconLabel from './SemanticIconLabel.svelte';

  export let weaknesses: ElementLabel[];
  export let iconOnly = false;

  $: accessibilityLabel = `弱点：${weaknesses.map((weakness) => weakness.name).join('、')}`;
</script>

{#if weaknesses.length}
  <span
    class:enemy-weakness-group--icon-only={iconOnly}
    class="enemy-weakness-group"
    role="group"
    aria-label={accessibilityLabel}
  >
    {#each weaknesses as weakness (weakness.element)}
      <SemanticIconLabel
        kind="element"
        code={weakness.element}
        label={weakness.name}
        color={getElementColor(weakness.element)}
      />
    {/each}
  </span>
{/if}
