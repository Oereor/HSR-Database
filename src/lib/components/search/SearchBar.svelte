<script lang="ts">
  import * as InputGroup from '$lib/components/ui/input-group';
  import * as Tooltip from '$lib/components/ui/tooltip';
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
      {#if variant === 'sidebar'}
        <Tooltip.Root>
          <Tooltip.Trigger type="submit">
            {#snippet child({ props })}
              <InputGroup.Button {...props} size="icon-sm" aria-label={m.search_submit_aria()}>
                <SearchIcon aria-hidden="true" />
              </InputGroup.Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>{m.common_search()}</Tooltip.Content>
        </Tooltip.Root>
      {:else}
        <InputGroup.Button type="submit" size="sm">
          <SearchIcon aria-hidden="true" />{m.common_search()}
        </InputGroup.Button>
      {/if}
    </InputGroup.Addon>
  </InputGroup.Root>
</form>
