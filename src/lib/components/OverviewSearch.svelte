<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  export let id: string;
  export let value = '';
  export let placeholder: string;
  export let onSubmit: () => void | Promise<void>;

  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onSubmit();
  }
</script>

<form class="overview-search" on:submit|preventDefault={onSubmit}>
  <label for={id}>{m.common_search({}, { locale: 'zh-CN' })}</label>
  <div class="overview-search__control">
    <input {id} bind:value {placeholder} on:keydown={keydown} />
    <button type="submit" class="button">{m.common_search({}, { locale: 'zh-CN' })}</button>
  </div>
</form>

<style>
  .overview-search {
    display: grid;
    gap: 0.5rem;
  }

  .overview-search > label {
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-weight: 700;
  }

  .overview-search__control {
    display: flex;
    gap: 0.5rem;
  }

  .overview-search__control input {
    min-width: 0;
    flex: 1;
  }

  @media (max-width: 520px) {
    .overview-search__control {
      align-items: stretch;
      flex-direction: column;
    }

    .overview-search__control .button {
      width: 100%;
    }
  }
</style>
