<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import { getBrandIconUrl, getUtilityIconUrl } from '$lib/data/visual-assets';
  import type { PublicSiteVersion } from '$lib/domain/types';
  import { SITE_NAME } from '$lib/site';
  import PrimaryNavigation from './PrimaryNavigation.svelte';
  import SearchBar from './SearchBar.svelte';

  export let siteVersion: PublicSiteVersion;
  export let onOpenChangelog: () => void = () => undefined;

  let navigatorPane: HTMLDialogElement;
  let expanded = false;
  const trainPartyIconUrl = getBrandIconUrl('train-party');
  const changelogIconUrl = getUtilityIconUrl('changelog');

  $: revision = siteVersion.dataRevision;
  $: versionLabel = siteVersion.gameVersion
    ? m.navigation_data_version({ version: siteVersion.gameVersion }, { locale: 'zh-CN' })
    : m.navigation_unknown_version({}, { locale: 'zh-CN' });
  $: snapshotLabel = m.navigation_snapshot({ versionLabel, revision }, { locale: 'zh-CN' });

  function lockPage(locked: boolean) {
    document.body.classList.toggle('navigator-open', locked);
  }

  function openNavigator() {
    if (expanded) {
      closeNavigator();
      return;
    }
    expanded = true;
    lockPage(true);
    navigatorPane.showModal();
  }

  function closeNavigator() {
    if (navigatorPane?.open) navigatorPane.close();
    expanded = false;
    lockPage(false);
  }

  function handlePaneClick(event: MouseEvent) {
    if (event.target === navigatorPane) closeNavigator();
  }

  function handlePaneClose() {
    expanded = false;
    lockPage(false);
  }

  afterNavigate(() => {
    if (expanded) closeNavigator();
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') document.body.classList.remove('navigator-open');
  });
</script>

<aside class="navigator-rail" aria-label={m.navigation_compact_aria({}, { locale: 'zh-CN' })}>
  <a
    class="brand navigator-rail__brand"
    href="/"
    aria-label={m.navigation_home_aria({ siteName: SITE_NAME }, { locale: 'zh-CN' })}
  >
    <span class="brand-icon" aria-hidden="true">
      {#if trainPartyIconUrl}<img src={trainPartyIconUrl} alt="" />{/if}
    </span>
  </a>
  <button
    class="navigator-toggle"
    type="button"
    aria-label={m.navigation_open({}, { locale: 'zh-CN' })}
    aria-expanded={expanded}
    aria-controls="primary-navigator-pane"
    on:click={openNavigator}
  >
    <span aria-hidden="true"><i></i><i></i><i></i></span>
  </button>
  <button
    class="changelog-trigger"
    type="button"
    aria-label={m.navigation_changelog({}, { locale: 'zh-CN' })}
    on:click={onOpenChangelog}
  >
    {#if changelogIconUrl}<img src={changelogIconUrl} alt="" />{:else}<span aria-hidden="true"
        >{m.navigation_changelog_fallback({}, { locale: 'zh-CN' })}</span
      >{/if}
    <span class="changelog-trigger__tooltip" role="tooltip"
      >{m.navigation_changelog({}, { locale: 'zh-CN' })}</span
    >
  </button>
  <PrimaryNavigation pathname={$page.url.pathname} compact />
  <div class="navigator-rail__snapshot" role="status" aria-label={snapshotLabel}>
    <span class="snapshot-dot" aria-hidden="true"></span>
    <span class="navigator-rail__tooltip" role="tooltip">{snapshotLabel}</span>
  </div>
</aside>

<header class="mobile-header">
  <a class="brand" href="/">
    <span class="brand-icon" aria-hidden="true">
      {#if trainPartyIconUrl}<img src={trainPartyIconUrl} alt="" />{/if}
    </span><strong>{SITE_NAME}</strong>
  </a>
  <div class="mobile-header__actions">
    <button
      class="changelog-trigger mobile-header__changelog"
      type="button"
      aria-label={m.navigation_changelog({}, { locale: 'zh-CN' })}
      on:click={onOpenChangelog}
    >
      {#if changelogIconUrl}<img src={changelogIconUrl} alt="" />{:else}<span aria-hidden="true"
          >{m.navigation_changelog_fallback({}, { locale: 'zh-CN' })}</span
        >{/if}
      <span class="changelog-trigger__tooltip" role="tooltip"
        >{m.navigation_changelog({}, { locale: 'zh-CN' })}</span
      >
    </button>
    <button
      class="navigator-toggle"
      type="button"
      aria-label={m.navigation_open({}, { locale: 'zh-CN' })}
      aria-expanded={expanded}
      aria-controls="primary-navigator-pane"
      on:click={openNavigator}
    >
      <span aria-hidden="true"><i></i><i></i><i></i></span>
    </button>
  </div>
</header>

<dialog
  id="primary-navigator-pane"
  class="navigator-pane"
  bind:this={navigatorPane}
  aria-label={m.navigation_full_aria({}, { locale: 'zh-CN' })}
  on:click={handlePaneClick}
  on:close={handlePaneClose}
  on:cancel={handlePaneClose}
>
  <div class="navigator-pane__surface">
    <div class="navigator-pane__heading">
      <a class="brand navigator-pane__brand" href="/" on:click={closeNavigator}>
        <span class="brand-icon" aria-hidden="true">
          {#if trainPartyIconUrl}<img src={trainPartyIconUrl} alt="" />{/if}
        </span>
        <span
          ><strong>{SITE_NAME}</strong><small>{m.site_short_tagline({}, { locale: 'zh-CN' })}</small
          ></span
        >
      </a>
      <button
        class="navigator-toggle"
        type="button"
        aria-label={m.navigation_close({}, { locale: 'zh-CN' })}
        aria-expanded={expanded}
        aria-controls="primary-navigator-pane"
        on:click={closeNavigator}
      >
        <span aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
    </div>

    <SearchBar
      id="global-search"
      label={m.navigation_search_label({}, { locale: 'zh-CN' })}
      placeholder={m.navigation_search_placeholder({}, { locale: 'zh-CN' })}
      variant="sidebar"
    />

    <PrimaryNavigation pathname={$page.url.pathname} onSelect={closeNavigator} />

    <div class="navigator-pane__snapshot" aria-label={snapshotLabel}>
      <span class="snapshot-dot" aria-hidden="true"></span>
      <div><strong>{versionLabel}</strong><small>{revision}</small></div>
    </div>
  </div>
</dialog>
