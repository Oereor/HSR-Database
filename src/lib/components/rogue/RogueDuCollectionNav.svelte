<script lang="ts">
  export let activeCollection: 'blessings' | 'equations';

  const collections = [
    { id: 'blessings' as const, label: '祝福', href: '/rogue/du/blessings' },
    { id: 'equations' as const, label: '方程', href: '/rogue/du/equations' }
  ];
</script>

<nav class="rogue-du-nav" aria-label="差分宇宙图鉴分类">
  {#each collections as collection}
    <a
      href={collection.href}
      aria-current={activeCollection === collection.id ? 'page' : undefined}
    >
      {collection.label}
    </a>
  {/each}
</nav>

<style>
  .rogue-du-nav {
    display: flex;
    width: fit-content;
    max-width: 100%;
    overflow-x: auto;
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-control);
    margin: 0 0 var(--space-4);
    background: rgb(7 11 20 / 48%);
    scrollbar-width: none;
  }
  .rogue-du-nav::-webkit-scrollbar {
    display: none;
  }
  a {
    position: relative;
    min-width: 7rem;
    padding: 0.62rem 1.15rem;
    color: var(--text-muted);
    text-align: center;
    transition:
      background var(--motion),
      color var(--motion);
  }
  a + a {
    border-left: 1px solid var(--surface-border);
  }
  a::after {
    position: absolute;
    right: 0.9rem;
    bottom: -1px;
    left: 0.9rem;
    height: 2px;
    background: transparent;
    content: '';
  }
  a:hover,
  a[aria-current='page'] {
    background: rgb(196 162 117 / 7%);
    color: var(--text-primary);
  }
  a[aria-current='page']::after {
    background: var(--gold);
  }
  a:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: -2px;
  }
  @media (max-width: 520px) {
    .rogue-du-nav {
      width: 100%;
    }
    a {
      min-width: 0;
      flex: 1;
      padding-inline: 0.8rem;
    }
  }
</style>
