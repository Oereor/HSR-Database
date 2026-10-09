<script lang="ts">
  import { gameTextToPlain } from '$lib/domain/game-text';
  export let name: string;
  export let active: boolean;
  export let onToggle: () => void;
</script>

<button
  class="trace-toggle"
  type="button"
  aria-label={gameTextToPlain(name)}
  aria-pressed={active}
  on:click={onToggle}
></button>

<style>
  .trace-toggle {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }
  .trace-toggle:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
  }
</style>
