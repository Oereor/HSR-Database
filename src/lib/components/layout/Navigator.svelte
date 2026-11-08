<script lang="ts">
  import { browser } from '$app/environment';
  import * as Select from '$lib/components/ui/select';
  import LanguagesIcon from '@lucide/svelte/icons/languages';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { onDestroy } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import SearchIcon from '@lucide/svelte/icons/search';
  import XIcon from '@lucide/svelte/icons/x';
  import { m } from '$lib/paraglide/messages.js';
  import { getBrandIconUrl, getUtilityIconUrl } from '$lib/data/visual-assets';
  import type { PublicSiteVersion } from '$lib/domain/types';
  import { localizedHref, localeCounterpartHref } from '$lib/i18n/routing';
  import { siteName } from '$lib/site';
  import PrimaryNavigation from './PrimaryNavigation.svelte';
  import SearchBar from '../search/SearchBar.svelte';

  let {
    siteVersion,
    locale,
    onOpenChangelog = () => undefined
  }: {
    siteVersion: PublicSiteVersion;
    locale: Locale;
    onOpenChangelog?: () => void;
  } = $props();
  const sidebar = Sidebar.useSidebar();
  let focusSearch = $state(false);
  let focusFrame: number | undefined;
  const trainPartyIconUrl = getBrandIconUrl('train-party');
  const changelogIconUrl = getUtilityIconUrl('changelog');
  const homeHref = localizedHref('/');
  const name = siteName();
  const revision = $derived(siteVersion.dataRevision);
  const versionLabel = $derived(
    siteVersion.gameVersion
      ? m.navigation_data_version({ version: siteVersion.gameVersion })
      : m.navigation_unknown_version()
  );
  const snapshotLabel = $derived(m.navigation_snapshot({ versionLabel, revision }));

  function switchLocale(value: string) {
    if (!browser || (value !== 'zh-CN' && value !== 'en') || value === locale) return;
    const { pathname, search, hash } = window.location;
    window.location.assign(localeCounterpartHref(`${pathname}${search}${hash}`, value));
  }

  function openSearch() {
    sidebar.setOpen(true);
    focusSearch = true;
  }
  afterNavigate(() => sidebar.setOpenMobile(false));
  onDestroy(() => {
    focusSearch = false;
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
  });
  function focusVisibleSearch() {
    focusFrame = undefined;
    if (!focusSearch || !sidebar.open || !sidebar.expandedReady || sidebar.isMobile) return;
    const input = document.getElementById('global-search');
    if (
      input?.getClientRects().length &&
      getComputedStyle(input).visibility === 'visible' &&
      !input.closest('[inert]')
    ) {
      input.focus({ preventScroll: true });
      if (document.activeElement === input) {
        focusSearch = false;
        return;
      }
    }
    // Observe visible layout frames rather than assuming a delay for CSS or reduced-motion.
    focusFrame = requestAnimationFrame(focusVisibleSearch);
  }
  $effect(() => {
    if (!sidebar.isMobile) sidebar.setOpenMobile(false);
    if (!sidebar.open || sidebar.isMobile) {
      focusSearch = false;
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
      focusFrame = undefined;
    }
    if (focusSearch && sidebar.expandedReady && focusFrame === undefined) {
      focusFrame = requestAnimationFrame(focusVisibleSearch);
    }
  });
</script>

<Sidebar.Root collapsible="icon" class="navigator-panel">
  <Sidebar.Header>
    <div class="navigator-brand flex h-14 shrink-0 items-center gap-2 overflow-hidden">
      <Tooltip.Root disabled={sidebar.isMobile || !sidebar.open || !sidebar.expandedReady}>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <a
              {...{ ...props, type: undefined, disabled: undefined }}
              class="navigator-pane__brand flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
              href={homeHref}
              aria-label={m.navigation_home_aria({ siteName: name })}
              onclick={(event) => {
                if (typeof props.onclick === 'function') props.onclick(event);
                sidebar.setOpenMobile(false);
              }}
            >
              <span
                class="flex size-11 shrink-0 items-center justify-center [&_.brand-image-fallback]:size-8 [&_img]:size-8 [&_img]:object-contain"
                aria-hidden="true"
                ><AssetImage
                  src={trainPartyIconUrl}
                  alt=""
                  fallbackClass="brand-image-fallback"
                /></span
              >
              <strong
                class="navigator-brand-title min-w-0 truncate text-xs font-semibold transition-none"
                class:invisible={!sidebar.isMobile && (!sidebar.open || !sidebar.expandedReady)}
                >{name}</strong
              >
            </a>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">{name}</Tooltip.Content>
      </Tooltip.Root>
      {#if sidebar.isMobile}
        <Button
          variant="ghost"
          size="icon-sm"
          class="navigator-close shrink-0"
          aria-label={m.navigation_close()}
          onclick={() => sidebar.setOpenMobile(false)}><XIcon /></Button
        >
      {/if}
    </div>
    <div class="navigator-search flex h-11 shrink-0 items-center">
      {#if !sidebar.isMobile && !sidebar.open}
        <Sidebar.Menu
          ><Sidebar.MenuItem
            ><Sidebar.MenuButton
              size="lg"
              tooltipContent={m.navigation_search_label()}
              aria-label={m.navigation_search_label()}
              onclick={openSearch}><SearchIcon /></Sidebar.MenuButton
            ></Sidebar.MenuItem
          ></Sidebar.Menu
        >
      {:else}
        <div
          class="w-full min-w-0 transition-none"
          class:invisible={!sidebar.isMobile && !sidebar.expandedReady}
          inert={!sidebar.isMobile && !sidebar.expandedReady}
        >
          <SearchBar
            id="global-search"
            label={m.navigation_search_label()}
            placeholder={m.navigation_search_placeholder()}
            variant="sidebar"
          />
        </div>
      {/if}
    </div>
  </Sidebar.Header>
  <Sidebar.Content class="px-2.5">
    <PrimaryNavigation
      pathname={$page.url.pathname}
      onSelect={() => sidebar.setOpenMobile(false)}
    />
  </Sidebar.Content>
  <Sidebar.Footer class="border-sidebar-border border-t">
    <Sidebar.Menu
      ><Sidebar.MenuItem
        ><Sidebar.MenuButton
          size="lg"
          class="changelog-trigger"
          tooltipContent={m.navigation_changelog()}
          aria-label={m.navigation_changelog()}
          onclick={onOpenChangelog}
        >
          <span
            class="size-6 shrink-0 [&_.utility-image-fallback]:size-full [&_img]:size-full [&_img]:object-contain"
            ><AssetImage
              src={changelogIconUrl}
              alt=""
              fallbackClass="utility-image-fallback"
            /></span
          ><span class="group-data-[collapsible=icon]:hidden">{m.navigation_changelog()}</span>
        </Sidebar.MenuButton></Sidebar.MenuItem
      ></Sidebar.Menu
    >
    <Select.Root type="single" value={locale} onValueChange={switchLocale}>
      <Select.Trigger
        data-language-select
        aria-label={m.settings_language()}
        class="border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-11 w-full bg-transparent px-2 shadow-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>svg:last-child]:hidden"
      >
        <LanguagesIcon class="size-4 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden"
          >{locale === 'zh-CN' ? '简体中文' : 'English'}</span
        >
      </Select.Trigger>
      <Select.Content side="top" align="start" class="z-60" data-language-options>
        <Select.Item value="zh-CN" label="简体中文" data-locale="zh-CN">简体中文</Select.Item>
        <Select.Item value="en" label="English" data-locale="en">English</Select.Item>
      </Select.Content>
    </Select.Root>
    <Tooltip.Root disabled={sidebar.open || sidebar.isMobile}>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <div
            {...props}
            role="status"
            tabindex="-1"
            aria-label={snapshotLabel}
            class="navigator-snapshot text-muted-foreground flex h-11 shrink-0 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center"
          >
            <span class="snapshot-dot shrink-0" aria-hidden="true"></span>
            <span class="navigator-pane__snapshot min-w-0 group-data-[collapsible=icon]:hidden"
              ><strong class="block truncate text-xs font-medium">{versionLabel}</strong><small
                class="block truncate text-xs">{revision}</small
              ></span
            >
          </div>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="right">{snapshotLabel}</Tooltip.Content>
    </Tooltip.Root>
  </Sidebar.Footer>
</Sidebar.Root>
