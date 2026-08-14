<script lang="ts">
  import { ENDGAME_MODES, ENDGAME_MODE_META } from '$lib/domain/endgame-view';
  import type { EndgameMode } from '$lib/domain/endgame';

  export let activeMode: EndgameMode | undefined = undefined;
</script>

<nav class="endgame-mode-nav" aria-label="终局模式">
  {#each ENDGAME_MODES as mode}
    <a href={`/endgame/${mode}`} aria-current={activeMode === mode ? 'page' : undefined}>
      <strong>{ENDGAME_MODE_META[mode].label}</strong>
      <span>{mode.toUpperCase()}</span>
    </a>
  {/each}
</nav>
