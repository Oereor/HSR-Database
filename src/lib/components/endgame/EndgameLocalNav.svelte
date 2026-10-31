<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { afterNavigate } from '$app/navigation';
  import GameText from '$lib/components/shared/GameText.svelte';
  import type { EndgameLocalNavigationModel } from '$lib/domain/endgame-navigation';
  import { m } from '$lib/paraglide/messages.js';

  export let navigation: EndgameLocalNavigationModel;

  let trigger: HTMLButtonElement;
  let menuOpen = false;
  let content: HTMLElement | null = null;
  function openMenu() {
    menuOpen = true;
  }
  function closeMenu() {
    menuOpen = false;
  }
  afterNavigate(closeMenu);
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

<Sheet.Root bind:open={menuOpen}>
  <div class="endgame-local-nav-mobile">
    <button
      class="endgame-local-nav-trigger"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={menuOpen}
      aria-controls="endgame-local-navigation-menu"
      aria-label={m.endgame_local_current_aria({
        menu: navigation.menuLabel,
        current: navigation.currentLabel
      })}
      bind:this={trigger}
      on:click={openMenu}
    >
      <span><GameText text={navigation.currentLabel} /></span>
      <span aria-hidden="true">{m.endgame_local_select()}</span>
    </button>

    <Sheet.Content
      id="endgame-local-navigation-menu"
      side="bottom"
      showCloseButton={false}
      aria-describedby={undefined}
      bind:ref={content}
      class="endgame-local-menu max-h-[80dvh] gap-4 overflow-y-auto rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onOpenAutoFocus={(event) => {
        const current = content?.querySelector<HTMLElement>('[aria-current="page"]');
        if (current) {
          event.preventDefault();
          current.focus();
        }
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      }}
    >
      <header class="flex items-center justify-between gap-4">
        <Sheet.Title id="endgame-local-navigation-title">{navigation.menuLabel}</Sheet.Title>
        <Button
          variant="ghost"
          size="icon"
          class="endgame-local-menu__close"
          aria-label={m.endgame_local_close()}
          onclick={closeMenu}>×</Button
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
    </Sheet.Content>
  </div>
</Sheet.Root>
