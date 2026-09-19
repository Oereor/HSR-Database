<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { playerPageHref } from '$lib/player/resolve';

  export let state: 'invalid' | 'loading' | 'error' | 'missing' | 'active';
  export let uid: string | undefined = undefined;

  $: message =
    state === 'invalid'
      ? m.player_character_invalid_uid()
      : state === 'loading'
        ? m.player_character_loading()
        : state === 'missing'
          ? m.player_character_not_public()
          : state === 'error'
            ? m.player_character_unavailable()
            : m.player_character_context();
</script>

<aside
  class:player-context-notice--fallback={state !== 'active'}
  class="player-context-notice"
  aria-live="polite"
>
  <div>
    <strong>{message}</strong>
    {#if uid}<span>{m.player_uid()} {uid}</span>{/if}
  </div>
  {#if state === 'active' && uid}
    <a href={playerPageHref(uid)}>{m.player_character_back_to_player()}</a>
  {/if}
</aside>
