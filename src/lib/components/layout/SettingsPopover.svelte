<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { getUtilityIconUrl } from '$lib/data/visual-assets';
  import { localeCounterpartHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { afterNavigate } from '$app/navigation';

  export let locale: Locale;

  let open = false;
  const settingsIconUrl = getUtilityIconUrl('settings');

  $: currentHref = `${$page.url.pathname}${browser ? $page.url.search : ''}${browser ? $page.url.hash : ''}`;
  $: chineseHref = localeCounterpartHref(currentHref, 'zh-CN');
  $: englishHref = localeCounterpartHref(currentHref, 'en');

  afterNavigate(() => {
    open = false;
  });

  function keepCurrentLocale(event: MouseEvent) {
    event.preventDefault();
  }
</script>

<Popover.Root bind:open>
  <div
    class="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30"
  >
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="icon"
          class="settings-trigger border-ring/40 bg-card size-11 rounded-full shadow-lg"
          aria-label={open ? m.settings_close() : m.settings_open()}
          title={m.settings_label()}
        >
          <span class="size-7 [&_.utility-image-fallback]:size-full [&_img]:size-full"
            ><AssetImage
              src={settingsIconUrl}
              alt=""
              fallbackClass="utility-image-fallback"
            /></span
          >
        </Button>
      {/snippet}
    </Popover.Trigger>
  </div>
  <Popover.Content
    id="site-settings-panel"
    side="top"
    align="end"
    sideOffset={8}
    class="settings-panel w-56 max-w-[calc(100vw-2rem)]"
    aria-label={m.settings_label()}
  >
    <div class="settings-panel__heading flex items-center justify-between gap-3">
      <strong class="text-xs">{m.settings_language()}</strong>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={m.settings_close()}
        onclick={() => (open = false)}>×</Button
      >
    </div>
    <div
      class="language-segments grid grid-cols-2 gap-1"
      role="group"
      aria-label={m.settings_language()}
    >
      <Button
        variant={locale === 'zh-CN' ? 'secondary' : 'ghost'}
        aria-current={locale === 'zh-CN' ? 'true' : undefined}
        aria-label={m.settings_switch_to({ language: '中文' })}
        href={chineseHref}
        data-sveltekit-reload
        onclick={locale === 'zh-CN' ? keepCurrentLocale : undefined}>中文</Button
      >
      <Button
        variant={locale === 'en' ? 'secondary' : 'ghost'}
        aria-current={locale === 'en' ? 'true' : undefined}
        aria-label={m.settings_switch_to({ language: 'EN' })}
        href={englishHref}
        data-sveltekit-reload
        onclick={locale === 'en' ? keepCurrentLocale : undefined}>EN</Button
      >
    </div>
  </Popover.Content>
</Popover.Root>
