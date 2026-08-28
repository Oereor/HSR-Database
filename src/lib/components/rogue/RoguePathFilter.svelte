<script lang="ts">
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
    on:click={() => (value = undefined)}>全部</button
  >
  {#each paths as path (path.rawType)}<button
      type="button"
      class:active={value === path.rawType}
      aria-pressed={value === path.rawType}
      on:click={() => (value = path.rawType)}>{path.name}</button
    >{/each}
</div>

<style>
  .rogue-path-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  button {
    border: 1px solid var(--surface-border);
    border-radius: 999px;
    background: rgb(255 255 255 / 2%);
    padding: 0.42rem 0.72rem;
    color: var(--text-secondary);
    font-size: var(--font-helper);
    transition:
      border-color var(--motion),
      background var(--motion),
      color var(--motion);
  }
  button:hover,
  button.active {
    border-color: var(--surface-border-strong);
    background: rgb(215 181 109 / 10%);
    color: var(--gold-soft);
  }
  button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
</style>
