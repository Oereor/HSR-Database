<script lang="ts">
  import SearchInputGroup from './SearchInputGroup.svelte';
  import { m } from '$lib/paraglide/messages.js';
  export let id: string;
  export let value = '';
  export let placeholder: string;
  export let onSubmit: () => void | Promise<void>;
</script>

<form class="overview-search grid min-w-0 gap-2" role="search" on:submit|preventDefault={onSubmit}>
  <label class="sr-only" for={id}>{m.common_search()}</label>
  <SearchInputGroup {id} bind:value {placeholder} submitLabel={m.common_search()} />
</form>
