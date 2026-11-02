<script lang="ts">
  import * as InputGroup from '$lib/components/ui/input-group';
  import SearchIcon from '@lucide/svelte/icons/search';
  import { m } from '$lib/paraglide/messages.js';
  export let id: string;
  export let value = '';
  export let placeholder: string;
  export let onSubmit: () => void | Promise<void>;
</script>

<form class="overview-search grid min-w-0 gap-2" role="search" on:submit|preventDefault={onSubmit}>
  <label class="text-muted-foreground text-sm font-medium" for={id}>{m.common_search()}</label>
  <InputGroup.Root>
    <InputGroup.Input {id} bind:value {placeholder} />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button type="submit" size="sm"
        ><SearchIcon aria-hidden="true" />{m.common_search()}</InputGroup.Button
      >
    </InputGroup.Addon>
  </InputGroup.Root>
</form>
