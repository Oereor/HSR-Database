<script lang="ts">
  import { onMount } from 'svelte';
  import { ROGUE_MODES, ROGUE_MODE_LABELS, type RogueMode } from '$lib/domain/rogue';

  export let activeMode: RogueMode;
  let navigation: HTMLElement;

  const hrefFor = (mode: RogueMode) => (mode === 'du' ? '/rogue/du/blessings' : `/rogue/${mode}`);

  onMount(() => {
    navigation
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
</script>

<nav class="rogue-mode-nav" aria-label="Rogue 模式" bind:this={navigation}>
  {#each ROGUE_MODES as mode}
    <a href={hrefFor(mode)} aria-current={activeMode === mode ? 'page' : undefined}>
      {#if activeMode === mode}<h1>{ROGUE_MODE_LABELS[mode]}</h1>{:else}<strong
          >{ROGUE_MODE_LABELS[mode]}</strong
        >{/if}
    </a>
  {/each}
</nav>

<style>
  .rogue-mode-nav {
    display: flex;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border-bottom: 1px solid var(--surface-border);
    margin: var(--space-2) 0 var(--space-6);
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }
  .rogue-mode-nav::-webkit-scrollbar {
    display: none;
  }
  .rogue-mode-nav a {
    position: relative;
    display: flex;
    min-width: max-content;
    flex: 1 0 auto;
    align-items: center;
    border-radius: var(--radius-control) var(--radius-control) 0 0;
    padding: 0.9rem var(--space-4) 0.8rem;
    color: var(--text-secondary);
    transition:
      background var(--motion),
      color var(--motion);
  }
  .rogue-mode-nav a::after {
    position: absolute;
    right: var(--space-4);
    bottom: -1px;
    left: var(--space-4);
    height: 2px;
    background: transparent;
    content: '';
  }
  .rogue-mode-nav a:hover,
  .rogue-mode-nav a[aria-current='page'] {
    background: linear-gradient(to bottom, transparent, rgb(215 181 109 / 7%));
    color: var(--text-primary);
  }
  .rogue-mode-nav a[aria-current='page']::after {
    background: var(--gold);
  }
  h1,
  strong {
    margin: 0;
    font-size: var(--font-major-title);
    line-height: 1.25;
    white-space: nowrap;
  }
  h1 {
    color: var(--gold-soft);
    font-size: var(--font-section-title);
  }
  @media (max-width: 820px) {
    .rogue-mode-nav {
      margin-block: var(--space-1) var(--space-4);
    }
    .rogue-mode-nav a {
      padding: 0.72rem 0.75rem 0.65rem;
    }
  }
</style>
