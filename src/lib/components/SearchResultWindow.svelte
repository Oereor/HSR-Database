<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  export let shown: number;
  export let total: number;
  export let onLoadMore: () => void;
</script>

<div class="search-result-window" data-search-total={total}>
  <p>{m.search_result_window({ shown: Math.min(shown, total), total })}</p>
  {#if shown < total}
    <button type="button" on:click={onLoadMore}>{m.search_load_more()}</button>
  {/if}
</div>

<style>
  .search-result-window {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-top: var(--space-6);
  }

  p {
    margin: 0;
    color: var(--text-muted);
  }

  button {
    min-height: 44px;
    padding: var(--space-3) var(--space-6);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    color: var(--gold-soft);
    background: var(--surface);
  }
</style>
