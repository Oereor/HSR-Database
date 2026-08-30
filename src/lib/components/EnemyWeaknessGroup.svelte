<script lang="ts">
  import type { ElementLabel } from '$lib/domain/types';
  import { getElementColor } from '$lib/domain/elements';
  import SemanticIconLabel from './SemanticIconLabel.svelte';

  export let weaknesses: ElementLabel[];
  export let size: 'default' | 'overview' = 'default';

  $: accessibilityLabel = `弱点：${weaknesses.map((weakness) => weakness.name).join('、')}`;
</script>

{#if weaknesses.length}
  <span
    class="enemy-weakness-group"
    class:enemy-weakness-group--overview={size === 'overview'}
    role="group"
    aria-label={accessibilityLabel}
  >
    {#each weaknesses as weakness (weakness.element)}
      <span class="enemy-weakness-group__item" title={`${weakness.name}属性弱点`}>
        <SemanticIconLabel
          kind="element"
          code={weakness.element}
          label={`${weakness.name}属性弱点`}
          color={getElementColor(weakness.element)}
          showLabel={false}
        />
      </span>
    {/each}
  </span>
{/if}

<style>
  .enemy-weakness-group {
    --semantic-icon-gap: 0.25rem;
    --semantic-icon-image-size: 1rem;

    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    flex: 0 1 auto;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.42rem;
    color: inherit;
    line-height: 1.2;
    white-space: nowrap;
  }

  .enemy-weakness-group__item {
    display: inline-flex;
  }

  .enemy-weakness-group--overview {
    --semantic-icon-image-size: 1.25rem;

    gap: 0.36rem;
  }
</style>
