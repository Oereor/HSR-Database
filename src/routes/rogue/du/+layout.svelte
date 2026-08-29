<script lang="ts">
  import { page } from '$app/stores';
  import RogueDuCollectionNav from '$lib/components/rogue/RogueDuCollectionNav.svelte';
  import RogueModeNav from '$lib/components/rogue/RogueModeNav.svelte';
  import type { RogueDuPageView } from '$lib/domain/rogue';

  export let data: { rogue: RogueDuPageView };

  $: activeCollection = $page.url.pathname.endsWith('/equations')
    ? ('equations' as const)
    : ('blessings' as const);
</script>

<RogueModeNav activeMode="du" />

<header class="page-heading rogue-heading">
  <div>
    <p class="kicker">ROGUE ARCHIVE</p>
    <h2>差分宇宙</h2>
    <p>祝福与方程分别浏览，并按命途筛选。</p>
  </div>
</header>

<RogueDuCollectionNav {activeCollection} />

<p class="rogue-du-note" data-du-revision>
  <span aria-hidden="true">ⓘ</span>
  当前展示数据对应「{data.rogue.revisionLabel}」（Tourn3）。
</p>

<slot />

<style>
  .rogue-heading {
    margin-bottom: var(--space-4);
  }
  .rogue-heading h2 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: var(--font-page-title);
  }
  .rogue-du-note {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    margin: 0 0 var(--space-5);
    color: var(--text-muted);
    font-size: var(--font-helper);
    line-height: 1.6;
  }
  .rogue-du-note span {
    color: var(--gold);
  }
  :global(.rogue-collection-filter) {
    display: grid;
    align-items: start;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  :global(.rogue-collection-filter > span) {
    color: var(--text-muted);
    font-size: var(--font-helper);
    letter-spacing: 0.05em;
  }
  :global(.rogue-card-list) {
    display: grid;
    min-width: 0;
    gap: var(--space-4);
  }
  @media (max-width: 520px) {
    :global(.rogue-card-list) {
      gap: var(--space-3);
    }
  }
</style>
