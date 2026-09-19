<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';

  export let characterId: string;
</script>

<article class="unknown-character" aria-label={m.player_unknown_character()}>
  <div class="unknown-character__placeholder" aria-hidden="true">?</div>
  <div>
    <h3>{m.player_unknown_character()}</h3>
    <p>{m.player_unknown_character_id({ id: characterId })}</p>
  </div>
</article>

<style>
  .unknown-character {
    display: grid;
    min-height: 172px;
    grid-template-rows: minmax(110px, 1fr) auto;
    overflow: hidden;
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }

  .unknown-character__placeholder {
    display: grid;
    place-items: center;
    background: linear-gradient(145deg, var(--surface-3), var(--surface));
    color: var(--faint);
    font-size: 2rem;
  }

  .unknown-character > div:last-child {
    padding: var(--space-3);
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 0.9rem;
  }

  p {
    margin-top: var(--space-1);
    color: var(--muted);
    font-size: 0.72rem;
  }
</style>
