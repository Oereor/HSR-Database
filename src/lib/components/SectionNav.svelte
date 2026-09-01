<script lang="ts">
  import { onMount } from 'svelte';

  export let items: readonly { id: string; label: string }[] = [];
  export let ariaLabel = '详情章节';

  let navElement: HTMLElement;
  let activeId = items[0]?.id ?? '';
  let pendingId: string | undefined;
  let observer: IntersectionObserver | undefined;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let setupFrame: number | undefined;
  let mounted = false;
  let visibleIds = new Set<string>();

  $: itemSignature = items.map(({ id }) => id).join('|');
  $: if (mounted && itemSignature) scheduleObserverSetup();

  function selectVisibleSection(): void {
    const visibleItems = items.filter(({ id }) => visibleIds.has(id));
    if (visibleItems.length) activeId = visibleItems[visibleItems.length - 1].id;
  }

  function clearPendingSelection(): void {
    pendingId = undefined;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = undefined;
  }

  function setupObserver(): void {
    observer?.disconnect();
    visibleIds = new Set<string>();

    const targets = items
      .map(({ id }) => document.getElementById(id))
      .filter((target): target is HTMLElement => target instanceof HTMLElement);
    if (!targets.length) return;

    const stickyTop = Number.parseFloat(getComputedStyle(navElement).top) || 0;
    const activationTop = Math.ceil(stickyTop + navElement.offsetHeight + 8);
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleIds.add(entry.target.id);
          else visibleIds.delete(entry.target.id);
        }

        if (pendingId) {
          if (visibleIds.has(pendingId)) {
            activeId = pendingId;
            clearPendingSelection();
          }
          return;
        }
        selectVisibleSection();
      },
      { rootMargin: `-${activationTop}px 0px -55% 0px`, threshold: 0 }
    );
    targets.forEach((target) => observer?.observe(target));
  }

  function scheduleObserverSetup(): void {
    if (setupFrame !== undefined) cancelAnimationFrame(setupFrame);
    setupFrame = requestAnimationFrame(() => {
      setupFrame = undefined;
      setupObserver();
    });
  }

  function handleAnchorClick(id: string): void {
    activeId = id;
    pendingId = id;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingId = undefined;
      pendingTimer = undefined;
      selectVisibleSection();
    }, 1200);
  }

  function syncHash(): void {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (items.some((item) => item.id === id)) activeId = id;
  }

  onMount(() => {
    mounted = true;
    activeId = items[0]?.id ?? '';
    syncHash();
    scheduleObserverSetup();
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('resize', scheduleObserverSetup);

    return () => {
      mounted = false;
      observer?.disconnect();
      if (pendingTimer) clearTimeout(pendingTimer);
      if (setupFrame !== undefined) cancelAnimationFrame(setupFrame);
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('resize', scheduleObserverSetup);
    };
  });
</script>

<nav bind:this={navElement} class="section-nav" aria-label={ariaLabel}>
  <div class="section-nav__items">
    {#each items as item (item.id)}
      <a
        class:section-nav__link--active={activeId === item.id}
        class="section-nav__link"
        href={`#${item.id}`}
        aria-current={activeId === item.id ? 'location' : undefined}
        on:click={() => handleAnchorClick(item.id)}>{item.label}</a
      >
    {/each}
  </div>
</nav>

<style>
  .section-nav {
    position: sticky;
    z-index: 8;
    top: var(--site-header-height);
    height: var(--section-nav-height);
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    background: rgb(7 10 18 / 94%);
    overscroll-behavior-inline: contain;
    scrollbar-width: thin;
    white-space: nowrap;
  }

  .section-nav__items {
    display: flex;
    width: max-content;
    min-width: 100%;
    height: 100%;
    align-items: stretch;
    gap: var(--space-6);
  }

  .section-nav__link {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-weight: 600;
    transition: color var(--motion);
  }

  .section-nav__link::after {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--gold);
    content: '';
    opacity: 0;
    transform: scaleX(0.45);
    transition:
      opacity var(--motion),
      transform var(--motion);
  }

  .section-nav__link:hover,
  .section-nav__link--active {
    color: var(--text-primary);
  }

  .section-nav__link--active::after {
    opacity: 1;
    transform: scaleX(1);
  }

  :global(.section-nav-target) {
    scroll-margin-top: calc(var(--site-header-height) + var(--section-nav-height) + var(--space-4));
  }
</style>
