<script lang="ts">
  import * as InputGroup from '$lib/components/ui/input-group';
  import SearchIcon from '@lucide/svelte/icons/search';
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
  <InputGroup.Root class="search-bar__control">
    <InputGroup.Input {id} {name} bind:value {placeholder} />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button
        type="submit"
        size={variant === 'sidebar' ? 'icon-sm' : 'sm'}
        aria-label={variant === 'sidebar' ? m.search_submit_aria() : undefined}
        title={variant === 'sidebar' ? m.common_search() : undefined}
      >
        <SearchIcon aria-hidden="true" />
        {#if variant !== 'sidebar'}{m.common_search()}{/if}
      </InputGroup.Button>
    </InputGroup.Addon>
  </InputGroup.Root>
</form>
