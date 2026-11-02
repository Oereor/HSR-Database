<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { cn } from '$lib/utils.js';
  import { Separator } from '$lib/components/ui/separator';
  import { afterNavigate } from '$app/navigation';
  import GameText from '$lib/components/shared/GameText.svelte';
  import type { EndgameLocalNavigationModel } from '$lib/domain/endgame-navigation';
  import { m } from '$lib/paraglide/messages.js';

  export let navigation: EndgameLocalNavigationModel;

  const linkClass = cn(
    buttonVariants({ variant: 'ghost' }),
    'h-auto min-h-9 w-full min-w-0 justify-start border-l-2 px-2 py-2 text-left whitespace-normal wrap-anywhere text-muted-foreground aria-[current=page]:border-l-primary aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary'
  );
  let trigger: HTMLButtonElement | null = null;
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

<aside
  class="endgame-local-nav border-border sticky top-[var(--anchor-offset)] max-h-[calc(100dvh-var(--anchor-offset)-1rem)] min-w-0 [scrollbar-width:thin] overflow-y-auto border-r pr-4 [@media(max-width:1080px)]:hidden"
>
  <nav class="grid gap-6" aria-label={navigation.ariaLabel}>
    {#each navigation.sections as section}
      <section>
        <h2 class="text-muted-foreground m-0 mb-3 text-xs font-semibold tracking-wide">
          {section.label}
        </h2>
        <div class="grid min-w-0 gap-1">
          {#each section.items as item (item.id)}
            <a
              class={linkClass}
              href={item.href}
              aria-current={item.current ? 'page' : undefined}
              title={item.title}
            >
              <GameText text={item.label} />
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </nav>
</aside>

<Sheet.Root bind:open={menuOpen}>
  <div class="endgame-local-nav-mobile hidden min-w-0 [@media(max-width:1080px)]:block">
    <Button
      variant="outline"
      class="endgame-local-nav-trigger h-auto min-h-11 w-full min-w-0 justify-between gap-4 p-3 text-left whitespace-normal"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={menuOpen}
      aria-controls="endgame-local-navigation-menu"
      aria-label={m.endgame_local_current_aria({
        menu: navigation.menuLabel,
        current: navigation.currentLabel
      })}
      bind:ref={trigger}
      onclick={openMenu}
    >
      <span class="min-w-0 wrap-anywhere"><GameText text={navigation.currentLabel} /></span>
      <span class="text-primary shrink-0 text-xs" aria-hidden="true"
        >{m.endgame_local_select()}</span
      >
    </Button>

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
          class="endgame-local-menu__close text-muted-foreground text-2xl"
          aria-label={m.endgame_local_close()}
          onclick={closeMenu}>×</Button
        >
      </header>
      <Separator />
      <nav class="grid gap-6" aria-label={navigation.ariaLabel}>
        {#each navigation.sections as section}
          <section>
            <h3 class="text-muted-foreground m-0 mb-2 text-xs font-semibold">{section.label}</h3>
            <div class="grid min-w-0 gap-1">
              {#each section.items as item (item.id)}
                <a
                  class={linkClass}
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
