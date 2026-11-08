<script lang="ts">
  import SearchInputGroup from '$lib/components/shared/SearchInputGroup.svelte';
  import { Label } from '$lib/components/ui/label';
  import { m } from '$lib/paraglide/messages.js';

  export let value = '';
  export let busy = false;
  export let errorMessage: string | null = null;
  export let onSubmit: (value: string) => void | Promise<void> = () => undefined;
  export let onInput: () => void = () => undefined;

  const inputId = 'player-uid-input';
  const errorId = 'player-uid-error';
</script>

<form
  class="player-uid-form mb-4 grid min-w-0 gap-2"
  aria-busy={busy}
  on:submit|preventDefault={() => onSubmit(value)}
>
  <Label class="sr-only" for={inputId}>{m.player_uid_label()}</Label>
  <SearchInputGroup
    id={inputId}
    bind:value
    placeholder={m.player_uid_placeholder()}
    submitLabel={m.player_query()}
    className="player-uid-form__controls"
    {busy}
    inputProps={{
      name: 'uid',
      inputmode: 'numeric',
      autocomplete: 'off',
      'aria-invalid': errorMessage ? 'true' : undefined,
      'aria-describedby': errorMessage ? errorId : undefined,
      oninput: onInput
    }}
  />
  {#if errorMessage}
    <p
      id={errorId}
      class="player-uid-form__error text-destructive m-0 text-xs leading-relaxed wrap-anywhere"
      role="alert"
    >
      {errorMessage}
    </p>
  {/if}
</form>
