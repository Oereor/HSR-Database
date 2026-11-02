<script lang="ts">
  import * as InputGroup from '$lib/components/ui/input-group';
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
  <Label for={inputId}>{m.player_uid_label()}</Label>
  <InputGroup.Root class="player-uid-form__controls">
    <InputGroup.Input
      id={inputId}
      name="uid"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder={m.player_uid_placeholder()}
      bind:value
      aria-invalid={errorMessage ? 'true' : undefined}
      aria-describedby={errorMessage ? errorId : undefined}
      oninput={onInput}
    />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button variant="default" size="sm" type="submit" disabled={busy}
        >{m.player_query()}</InputGroup.Button
      >
    </InputGroup.Addon>
  </InputGroup.Root>
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
