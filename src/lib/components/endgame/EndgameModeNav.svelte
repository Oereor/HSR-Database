<script lang="ts">
  import { onMount } from 'svelte';
  import { ENDGAME_MODES, ENDGAME_MODE_META } from '$lib/domain/endgame-view';
  import type { EndgameMode } from '$lib/domain/endgame';
  import EndgameModeIcon from './EndgameModeIcon.svelte';

  export let activeMode: EndgameMode | undefined = undefined;

  let navigation: HTMLElement;

  onMount(() => {
    navigation
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
</script>

<div class="endgame-mode-switcher">
  <nav class="endgame-mode-switcher__island" aria-label="高难模式切换" bind:this={navigation}>
    {#each ENDGAME_MODES as mode}
      <a
        href={`/endgame/${mode}`}
        aria-current={activeMode === mode ? 'page' : undefined}
        style={`--endgame-accent: ${ENDGAME_MODE_META[mode].accent};`}
      >
        <span class="endgame-mode-switcher__icon"><EndgameModeIcon {mode} /></span>
        <strong>{ENDGAME_MODE_META[mode].label}</strong>
      </a>
    {/each}
  </nav>
</div>

<style>
  .endgame-mode-switcher {
    position: sticky;
    z-index: 10;
    top: var(--space-3);
    display: flex;
    min-width: 0;
    justify-content: center;
    margin: var(--space-1) 0 var(--space-8);
    pointer-events: none;
  }

  .endgame-mode-switcher__island {
    display: flex;
    width: max-content;
    max-width: 100%;
    min-width: 0;
    gap: var(--space-1);
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-control) + 4px);
    background: rgb(10 15 25 / 88%);
    padding: var(--space-1);
    backdrop-filter: blur(16px);
    box-shadow: 0 12px 30px rgb(0 0 0 / 24%);
    pointer-events: auto;
    scrollbar-width: none;
    overscroll-behavior-inline: contain;
  }

  .endgame-mode-switcher__island::-webkit-scrollbar {
    display: none;
  }

  .endgame-mode-switcher a {
    display: flex;
    min-width: max-content;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    padding: 0.68rem 0.9rem;
    color: var(--text-secondary);
    transition:
      border-color var(--motion),
      background var(--motion),
      color var(--motion);
  }

  .endgame-mode-switcher a:hover {
    border-color: color-mix(in srgb, var(--endgame-accent) 26%, transparent);
    background: color-mix(in srgb, var(--endgame-accent) 7%, transparent);
    color: var(--text-primary);
  }

  .endgame-mode-switcher a[aria-current='page'] {
    border-color: color-mix(in srgb, var(--endgame-accent) 42%, transparent);
    background: color-mix(in srgb, var(--endgame-accent) 13%, transparent);
    color: var(--text-primary);
  }

  .endgame-mode-switcher a:focus-visible {
    outline-color: var(--endgame-accent);
  }

  .endgame-mode-switcher__icon {
    display: grid;
    place-items: center;
    font-size: 1.55rem;
    opacity: 0.58;
    transition: opacity var(--motion);
  }

  .endgame-mode-switcher a:hover .endgame-mode-switcher__icon,
  .endgame-mode-switcher a[aria-current='page'] .endgame-mode-switcher__icon {
    opacity: 1;
  }

  .endgame-mode-switcher strong {
    font-size: var(--font-meta-value);
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
  }

  @media (max-width: 700px) {
    .endgame-mode-switcher {
      justify-content: stretch;
      margin-bottom: var(--space-6);
    }

    .endgame-mode-switcher__island {
      width: 100%;
    }

    .endgame-mode-switcher a {
      padding: 0.6rem 0.78rem;
    }
  }
</style>
