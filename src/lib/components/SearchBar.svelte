<script lang="ts">
  export let id: string;
  export let label: string;
  export let placeholder: string;
  export let value = '';
  export let variant: 'default' | 'sidebar' = 'default';
  export let action = '/search';
  export let name = 'q';
  export let onSubmit: (() => void | Promise<void>) | undefined = undefined;

  function handleSubmit(event: SubmitEvent) {
    if (!onSubmit) return;
    event.preventDefault();
    void onSubmit();
  }
</script>

<form
  class:search-bar--sidebar={variant === 'sidebar'}
  class="search-bar"
  {action}
  role="search"
  on:submit={handleSubmit}
>
  <label class:sr-only={variant !== 'sidebar'} for={id}>{label}</label>
  <div class="search-bar__control">
    <input {id} {name} bind:value {placeholder} />
    <button
      type="submit"
      aria-label={variant === 'sidebar' ? '开始搜索' : undefined}
      title={variant === 'sidebar' ? '搜索' : undefined}
    >
      {#if variant === 'sidebar'}<span aria-hidden="true">⌕</span>{:else}搜索{/if}
    </button>
  </div>
</form>

<style>
  .search-bar {
    width: 100%;
  }

  .search-bar__control {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
  }

  .search-bar input {
    width: 100%;
    min-width: 0;
    min-height: 48px;
    background: rgb(7 10 18 / 72%);
  }

  .search-bar button {
    min-width: 7.5rem;
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: var(--radius-control);
    background: linear-gradient(135deg, #c7a55e, #806431);
    padding: 0.72rem 1.35rem;
    color: #0b0d12;
    font-weight: 800;
  }

  .search-bar--sidebar label {
    display: block;
    margin-bottom: var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-internal);
    font-weight: 650;
    letter-spacing: 0.04em;
  }

  .search-bar--sidebar .search-bar__control {
    display: flex;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: rgb(7 10 18 / 72%);
    gap: 0;
    transition:
      border-color var(--motion),
      box-shadow var(--motion),
      background var(--motion);
  }

  .search-bar--sidebar .search-bar__control:hover {
    border-color: rgb(215 181 109 / 28%);
    background: rgb(14 20 34 / 82%);
  }

  .search-bar--sidebar .search-bar__control:focus-within {
    border-color: var(--border-strong);
    box-shadow: 0 0 0 2px rgb(215 181 109 / 12%);
  }

  .search-bar--sidebar input {
    min-height: 42px;
    flex: 1 1 auto;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0.65rem 0 0.65rem var(--space-3);
    font-size: 0.8rem;
    text-overflow: ellipsis;
  }

  .search-bar--sidebar input:focus {
    outline: 0;
  }

  .search-bar--sidebar button {
    display: grid;
    width: 42px;
    min-width: 42px;
    min-height: 42px;
    flex: 0 0 42px;
    place-items: center;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
    color: var(--text-secondary);
    font-size: 1.15rem;
    transition:
      color var(--motion),
      background var(--motion);
  }

  .search-bar--sidebar button:hover {
    background: rgb(215 181 109 / 8%);
    color: var(--gold-soft);
  }

  .search-bar--sidebar button:focus-visible {
    outline-offset: -3px;
  }

  @media (max-width: 520px) {
    .search-bar__control {
      gap: var(--space-2);
    }

    .search-bar button {
      min-width: 4.75rem;
      padding-inline: var(--space-3);
    }

    .search-bar--sidebar .search-bar__control {
      gap: 0;
    }

    .search-bar--sidebar button {
      width: 42px;
      min-width: 42px;
      padding: 0;
    }
  }
</style>
