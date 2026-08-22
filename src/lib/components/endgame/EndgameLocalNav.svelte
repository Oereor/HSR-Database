<script lang="ts">
  import { tick } from 'svelte';
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameLocalNavigationModel } from '$lib/domain/endgame-navigation';

  export let navigation: EndgameLocalNavigationModel;

  let dialog: HTMLDialogElement;
  let trigger: HTMLButtonElement;
  let menuOpen = false;

  async function openMenu() {
    menuOpen = true;
    dialog.showModal();
    await tick();
    const currentLink = dialog.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    (currentLink ?? dialog.querySelector<HTMLButtonElement>('.endgame-local-menu__close'))?.focus();
  }

  function closeMenu() {
    if (dialog?.open) dialog.close();
  }

  function handleDialogClose() {
    menuOpen = false;
    trigger?.focus();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === dialog) closeMenu();
  }
</script>

<aside class="endgame-local-nav">
  <nav aria-label={navigation.ariaLabel}>
    {#each navigation.sections as section}
      <section>
        <h2>{section.label}</h2>
        <div>
          {#each section.items as item (item.id)}
            <a href={item.href} aria-current={item.current ? 'page' : undefined} title={item.title}>
              <GameText text={item.label} />
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </nav>
</aside>

<div class="endgame-local-nav-mobile">
  <button
    class="endgame-local-nav-trigger"
    type="button"
    aria-haspopup="dialog"
    aria-expanded={menuOpen}
    aria-controls="endgame-local-navigation-menu"
    aria-label={`${navigation.menuLabel}，当前${navigation.currentLabel}`}
    bind:this={trigger}
    on:click={openMenu}
  >
    <span><GameText text={navigation.currentLabel} /></span>
    <span aria-hidden="true">选择⌄</span>
  </button>

  <dialog
    id="endgame-local-navigation-menu"
    class="endgame-local-menu"
    aria-labelledby="endgame-local-navigation-title"
    bind:this={dialog}
    on:close={handleDialogClose}
    on:click={handleBackdropClick}
  >
    <header>
      <h2 id="endgame-local-navigation-title">{navigation.menuLabel}</h2>
      <button
        class="endgame-local-menu__close"
        type="button"
        aria-label="关闭节点选择"
        on:click={closeMenu}>×</button
      >
    </header>
    <nav aria-label={navigation.ariaLabel}>
      {#each navigation.sections as section}
        <section>
          <h3>{section.label}</h3>
          <div>
            {#each section.items as item (item.id)}
              <a
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                on:click={closeMenu}
              >
                <GameText text={item.label} />
              </a>
            {/each}
          </div>
        </section>
      {/each}
    </nav>
  </dialog>
</div>
