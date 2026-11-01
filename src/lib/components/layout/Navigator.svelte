<script lang="ts">
  import { tick } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
  import SearchIcon from '@lucide/svelte/icons/search';
  import XIcon from '@lucide/svelte/icons/x';
  import { m } from '$lib/paraglide/messages.js';
  import { getBrandIconUrl, getUtilityIconUrl } from '$lib/data/visual-assets';
  import type { PublicSiteVersion } from '$lib/domain/types';
  import { localizedHref } from '$lib/i18n/routing';
  import { siteName } from '$lib/site';
  import PrimaryNavigation from './PrimaryNavigation.svelte';
  import SearchBar from '../search/SearchBar.svelte';

  let {
    siteVersion,
    onOpenChangelog = () => undefined
  }: {
    siteVersion: PublicSiteVersion;
    onOpenChangelog?: () => void;
  } = $props();
  const sidebar = Sidebar.useSidebar();
  let returnFocus = $state<HTMLButtonElement>();
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

  function toggle(event: MouseEvent) {
    returnFocus = event.currentTarget as HTMLButtonElement;
    sidebar.toggle();
  }
  async function openSearch() {
    sidebar.setOpen(true);
    await tick();
    document.getElementById('global-search')?.focus({ preventScroll: true });
  }
  afterNavigate(() => sidebar.setOpenMobile(false));
  $effect(() => {
    // Close a mobile sheet before its trigger disappears at the desktop breakpoint.
    if (!sidebar.isMobile) sidebar.setOpenMobile(false);
  });
</script>

<header class="mobile-header">
  <a class="brand min-w-0" href={homeHref}>
    <span class="brand-icon" aria-hidden="true">
      <AssetImage src={trainPartyIconUrl} alt="" fallbackClass="brand-image-fallback" />
    </span><strong class="truncate">{name}</strong>
  </a>
  <div class="mobile-header__actions">
    <Button
      variant="ghost"
      size="icon"
      class="changelog-trigger"
      aria-label={m.navigation_changelog()}
      onclick={onOpenChangelog}
    >
      <span class="size-7 [&_.utility-image-fallback]:size-full [&_img]:size-full"
        ><AssetImage src={changelogIconUrl} alt="" fallbackClass="utility-image-fallback" /></span
      >
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="navigator-toggle"
      aria-label={m.navigation_open()}
      aria-expanded={sidebar.openMobile}
      aria-controls="primary-navigator-pane"
      onclick={toggle}><PanelLeftIcon /></Button
    >
  </div>
</header>

<Sidebar.Root collapsible="icon" {returnFocus} class="navigator-panel">
  <Sidebar.Header class="gap-3 p-3">
    <a
      class="brand navigator-pane__brand"
      href={homeHref}
      aria-label={m.navigation_home_aria({ siteName: name })}
      onclick={() => sidebar.setOpenMobile(false)}
    >
      <span class="brand-icon size-12!" aria-hidden="true"
        ><AssetImage src={trainPartyIconUrl} alt="" fallbackClass="brand-image-fallback" /></span
      >
      <span class="min-w-0 group-data-[collapsible=icon]:hidden"
        ><strong>{name}</strong><small>{m.site_short_tagline()}</small></span
      >
    </a>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          class="navigator-toggle h-11"
          tooltipContent={sidebar.open ? m.navigation_close() : m.navigation_open()}
          aria-label={sidebar.isMobile || sidebar.open ? m.navigation_close() : m.navigation_open()}
          aria-expanded={sidebar.isMobile ? sidebar.openMobile : sidebar.open}
          onclick={toggle}
        >
          {#if sidebar.isMobile}<XIcon />{:else}<PanelLeftIcon />{/if}
          <span class="group-data-[collapsible=icon]:hidden"
            >{sidebar.isMobile || sidebar.open ? m.navigation_close() : m.navigation_open()}</span
          >
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      {#if !sidebar.isMobile && !sidebar.open}
        <Sidebar.MenuItem
          ><Sidebar.MenuButton
            class="h-11"
            tooltipContent={m.navigation_search_label()}
            aria-label={m.navigation_search_label()}
            onclick={openSearch}
            ><SearchIcon /><span class="group-data-[collapsible=icon]:hidden"
              >{m.navigation_search_label()}</span
            ></Sidebar.MenuButton
          ></Sidebar.MenuItem
        >
      {/if}
    </Sidebar.Menu>
    {#if sidebar.isMobile || sidebar.open}
      <SearchBar
        id="global-search"
        label={m.navigation_search_label()}
        placeholder={m.navigation_search_placeholder()}
        variant="sidebar"
      />
    {/if}
  </Sidebar.Header>
  <Sidebar.Content class="px-3">
    <PrimaryNavigation
      pathname={$page.url.pathname}
      onSelect={() => sidebar.setOpenMobile(false)}
    />
  </Sidebar.Content>
  <Sidebar.Footer class="gap-3 border-t p-3">
    <Sidebar.Menu>
      <Sidebar.MenuItem
        ><Sidebar.MenuButton
          class="changelog-trigger h-11"
          tooltipContent={m.navigation_changelog()}
          aria-label={m.navigation_changelog()}
          onclick={onOpenChangelog}
        >
          <span class="size-7 shrink-0 [&_.utility-image-fallback]:size-full [&_img]:size-full"
            ><AssetImage
              src={changelogIconUrl}
              alt=""
              fallbackClass="utility-image-fallback"
            /></span
          ><span class="group-data-[collapsible=icon]:hidden">{m.navigation_changelog()}</span>
        </Sidebar.MenuButton></Sidebar.MenuItem
      >
      <Sidebar.MenuItem
        ><Sidebar.MenuButton
          class="navigator-snapshot h-auto min-h-11"
          tooltipContent={snapshotLabel}
          aria-label={snapshotLabel}
        >
          <span role="status" class="flex min-w-0 items-center gap-2">
            <span class="snapshot-dot shrink-0" aria-hidden="true"></span><span
              class="navigator-pane__snapshot min-w-0 group-data-[collapsible=icon]:hidden"
              ><strong>{versionLabel}</strong><small class="block truncate">{revision}</small></span
            >
          </span>
        </Sidebar.MenuButton></Sidebar.MenuItem
      >
    </Sidebar.Menu>
  </Sidebar.Footer>
</Sidebar.Root>
