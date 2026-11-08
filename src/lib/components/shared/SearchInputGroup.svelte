<script lang="ts">
  import * as InputGroup from '$lib/components/ui/input-group';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import SearchIcon from '@lucide/svelte/icons/search';
  import type { ComponentProps } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  export let id: string;
  export let value = '';
  export let placeholder: string;
  export let submitLabel: string;
  export let submitAriaLabel: string | undefined = undefined;
  export let inputProps: Pick<
    HTMLInputAttributes,
    'name' | 'inputmode' | 'autocomplete' | 'aria-invalid' | 'aria-describedby' | 'oninput'
  > = {};
  export let className: string | undefined = undefined;
  export let iconOnly = false;
  export let busy = false;
</script>

{#snippet submit(props: ComponentProps<typeof InputGroup.Button>)}
  <InputGroup.Button
    {...props}
    type="submit"
    size={iconOnly ? 'icon-sm' : 'sm'}
    aria-label={iconOnly ? (submitAriaLabel ?? submitLabel) : undefined}
    disabled={busy}
  >
    <SearchIcon aria-hidden="true" />
    {#if !iconOnly}{submitLabel}{/if}
  </InputGroup.Button>
{/snippet}

<InputGroup.Root class={className}>
  <InputGroup.Input {...inputProps} {id} bind:value {placeholder} />
  <InputGroup.Addon align="inline-end">
    {#if iconOnly}
      <Tooltip.Root>
        <Tooltip.Trigger type="submit">
          {#snippet child({ props })}{@render submit(props)}{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{submitLabel}</Tooltip.Content>
      </Tooltip.Root>
    {:else}
      {@render submit({})}
    {/if}
  </InputGroup.Addon>
</InputGroup.Root>
