<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
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
  <label
    class={variant === 'sidebar'
      ? 'text-muted-foreground mb-2 block text-xs font-medium'
      : 'sr-only'}
    for={id}>{label}</label
  >
  <div class="search-bar__control flex min-w-0 gap-2">
    <Input {id} {name} bind:value {placeholder} class="h-11 min-w-0 flex-1" />
    <Button
      type="submit"
      variant={variant === 'sidebar' ? 'outline' : 'default'}
      class="h-11 shrink-0"
      size={variant === 'sidebar' ? 'icon' : 'default'}
      aria-label={variant === 'sidebar' ? m.search_submit_aria() : undefined}
      title={variant === 'sidebar' ? m.common_search() : undefined}
    >
      <SearchIcon aria-hidden="true" />
      {#if variant !== 'sidebar'}{m.common_search()}{/if}
    </Button>
  </div>
</form>
