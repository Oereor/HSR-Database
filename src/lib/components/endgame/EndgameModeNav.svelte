<script lang="ts">
  import { buttonVariants } from '$lib/components/ui/button';
  import { cn } from '$lib/utils.js';
  import { onMount } from 'svelte';
  import { ENDGAME_MODES, ENDGAME_MODE_META } from '$lib/domain/endgame-view';
  import type { EndgameMode } from '$lib/domain/endgame';
  import EndgameModeIcon from './EndgameModeIcon.svelte';
  import { localizedHref } from '$lib/i18n/routing';
  import { getEndgameModeCopy } from '$lib/i18n/endgame';
  import { m } from '$lib/paraglide/messages.js';

  export let activeMode: EndgameMode | undefined = undefined;

  let navigation: HTMLElement;

  onMount(() => {
    navigation
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
</script>

<div
  class="endgame-mode-switcher pointer-events-none sticky top-[var(--global-sticky-top)] z-10 mt-1 mb-6 flex h-[var(--endgame-mode-nav-height)] min-w-0 items-center justify-center sm:mb-8"
>
  <nav
    class="endgame-mode-switcher__island bg-card/95 border-border pointer-events-auto flex w-full max-w-full min-w-0 [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain rounded-lg border p-1 backdrop-blur-sm sm:w-max [&::-webkit-scrollbar]:hidden"
    aria-label={m.endgame_mode_switcher_aria()}
    bind:this={navigation}
  >
    {#each ENDGAME_MODES as mode}
      <a
        class={cn(
          buttonVariants({ variant: 'ghost', size: 'lg' }),
          'group/mode aria-[current=page]:text-foreground gap-2 px-3 hover:border-[color-mix(in_srgb,var(--endgame-accent)_26%,transparent)] aria-[current=page]:border-[color-mix(in_srgb,var(--endgame-accent)_42%,transparent)] aria-[current=page]:bg-[color-mix(in_srgb,var(--endgame-accent)_13%,transparent)]'
        )}
        href={localizedHref(`/endgame/${mode}`)}
        aria-current={activeMode === mode ? 'page' : undefined}
        style={`--endgame-accent: ${ENDGAME_MODE_META[mode].accent};`}
      >
        <span
          class="endgame-mode-switcher__icon grid shrink-0 text-2xl opacity-60 group-hover/mode:opacity-100 group-aria-[current=page]/mode:opacity-100"
          ><EndgameModeIcon {mode} /></span
        >
        <strong class="text-sm leading-tight font-medium">{getEndgameModeCopy(mode).label}</strong>
      </a>
    {/each}
  </nav>
</div>
