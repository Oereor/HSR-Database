<script lang="ts">
  import ImageFallback from '$lib/components/shared/ImageFallback.svelte';
  import { m } from '$lib/paraglide/messages.js';

  export let characterId: string;
</script>

<article class="unknown-character" aria-label={m.player_unknown_character()}>
  <ImageFallback class="unknown-character__placeholder" />
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

  .unknown-character :global(.unknown-character__placeholder) {
    background: linear-gradient(145deg, var(--surface-3), var(--surface));
    --image-fallback-font-size: 2rem;
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
