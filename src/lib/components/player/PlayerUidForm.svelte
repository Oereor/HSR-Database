<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';

  export let value = '';
  export let busy = false;
  export let errorMessage: string | null = null;
  export let onSubmit: (value: string) => void | Promise<void> = () => undefined;
  export let onInput: () => void = () => undefined;

  const inputId = 'player-uid-input';
  const errorId = 'player-uid-error';
</script>

<form class="player-uid-form" aria-busy={busy} on:submit|preventDefault={() => onSubmit(value)}>
  <label for={inputId}>{m.player_uid_label()}</label>
  <div class="player-uid-form__controls">
    <input
      id={inputId}
      name="uid"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder={m.player_uid_placeholder()}
      bind:value
      aria-invalid={errorMessage ? 'true' : undefined}
      aria-describedby={errorMessage ? errorId : undefined}
      on:input={onInput}
    />
    <button class="button" type="submit" disabled={busy}>{m.player_query()}</button>
  </div>
  {#if errorMessage}
    <p id={errorId} class="player-uid-form__error" role="alert">{errorMessage}</p>
  {/if}
</form>

<style>
  .player-uid-form {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
  }

  label {
    color: var(--text-secondary);
    font-size: var(--font-internal);
    font-weight: 700;
  }

  .player-uid-form__controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
  }

  input {
    width: 100%;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    padding: 0.75rem 0.9rem;
    color: var(--text);
  }

  input:focus-visible {
    border-color: var(--gold);
    outline: 2px solid rgb(215 181 109 / 24%);
    outline-offset: 2px;
  }

  input[aria-invalid='true'] {
    border-color: rgb(239 137 137 / 72%);
  }

  button {
    min-width: 92px;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.62;
  }

  .player-uid-form__error {
    margin: 0;
    color: #f0a3a3;
    font-size: var(--font-internal);
  }

  @media (max-width: 520px) {
    .player-uid-form__controls {
      grid-template-columns: 1fr;
    }

    button {
      width: 100%;
    }
  }
</style>
