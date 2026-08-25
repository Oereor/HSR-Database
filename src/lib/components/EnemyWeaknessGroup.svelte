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
        showLabel={!iconOnly}
      />
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
    gap: 0.52rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgb(255 255 255 / 3%);
    padding: 0.38rem 0.62rem;
    color: var(--text-secondary);
    font-size: 0.78rem;
    line-height: 1.2;
    white-space: nowrap;
  }

  .enemy-weakness-group--icon-only {
    gap: 0.42rem;
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
  }

  @container overview-metadata (max-width: 190px) {
    .enemy-weakness-group:not(.enemy-weakness-group--icon-only) {
      --semantic-icon-label-position: absolute;
      --semantic-icon-label-width: 1px;
      --semantic-icon-label-height: 1px;
      --semantic-icon-label-overflow: hidden;
      --semantic-icon-label-clip: rect(0 0 0 0);
      --semantic-icon-label-clip-path: inset(50%);
      --semantic-icon-label-white-space: nowrap;

      gap: 0.58rem;
      padding-inline: 0.58rem;
    }
  }
</style>
