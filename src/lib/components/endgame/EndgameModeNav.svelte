<script lang="ts">
  import { onMount } from 'svelte';
  import { ENDGAME_MODES, ENDGAME_MODE_META } from '$lib/domain/endgame-view';
  import type { EndgameMode } from '$lib/domain/endgame';

  export let activeMode: EndgameMode | undefined = undefined;

  let navigation: HTMLElement;

  onMount(() => {
    navigation
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
</script>

<nav class="endgame-mode-nav" aria-label="终局模式" bind:this={navigation}>
  {#each ENDGAME_MODES as mode}
    <a href={`/endgame/${mode}`} aria-current={activeMode === mode ? 'page' : undefined}>
      {#if activeMode === mode}
        <h1>{ENDGAME_MODE_META[mode].label}</h1>
      {:else}
        <strong>{ENDGAME_MODE_META[mode].label}</strong>
      {/if}
      <span>{mode.toUpperCase()}</span>
    </a>
  {/each}
</nav>
