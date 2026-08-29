<script lang="ts">
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import type { RoguePath } from '$lib/domain/rogue';

  export let paths: RoguePath[];
  export let value: number | undefined = undefined;
  export let label = '按命途筛选';
</script>

<div class="rogue-path-filter" role="group" aria-label={label} data-rogue-path-filter>
  <button
    type="button"
    class:active={value === undefined}
    aria-pressed={value === undefined}
    data-path-filter-all
    on:click={() => (value = undefined)}>全部</button
  >
  {#each paths as path (path.rawType)}<button
      type="button"
      class:active={value === path.rawType}
      aria-pressed={value === path.rawType}
      data-path-filter-chip={path.rawType}
      on:click={() => (value = path.rawType)}
      ><SemanticIconLabel
        kind="path"
        code={path.code}
        label={path.name}
        fallbackMark={path.name.slice(1, 2)}
      /></button
    >{/each}
</div>

<style>
  .rogue-path-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  button {
    --semantic-icon-gap: 0.4rem;
    --semantic-icon-image-size: 1.05rem;
    border: 1px solid var(--surface-border);
    border-radius: 999px;
    background: rgb(255 255 255 / 1.8%);
    padding: 0.4rem 0.72rem;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--font-helper);
    line-height: 1.15;
    transition:
      border-color var(--motion),
      background var(--motion),
      color var(--motion);
  }
  button:hover,
  button.active {
    border-color: color-mix(in srgb, var(--gold) 52%, var(--surface-border));
    background: rgb(215 181 109 / 8%);
    color: var(--gold-soft);
  }
  button:hover:not(.active) {
    background: rgb(255 255 255 / 4%);
    color: var(--text-secondary);
  }
  button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
</style>
