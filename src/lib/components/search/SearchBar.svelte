<script lang="ts">
  import SearchInputGroup from '$lib/components/shared/SearchInputGroup.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { localizedHref } from '$lib/i18n/routing';
  export let id: string;
  export let label: string;
  export let placeholder: string;
  export let value = '';
  export let variant: 'default' | 'sidebar' = 'default';
  export let action = localizedHref('/search');
  export let name = 'q';
  export let onSubmit: (() => void | Promise<void>) | undefined = undefined;

  function handleSubmit(event: SubmitEvent) {
    if (!onSubmit) return;
    event.preventDefault();
    void onSubmit();
  }
</script>

<form class="search-bar w-full min-w-0" {action} role="search" on:submit={handleSubmit}>
  <label class="sr-only" for={id}>{label}</label>
  <SearchInputGroup
    {id}
    bind:value
    {placeholder}
    inputProps={{ name }}
    className="search-bar__control"
    iconOnly={variant === 'sidebar'}
    submitLabel={m.common_search()}
    submitAriaLabel={m.search_submit_aria()}
  />
</form>
