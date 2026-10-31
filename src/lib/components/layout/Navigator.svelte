<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import * as Sheet from '$lib/components/ui/sheet';
  import { getBrandIconUrl, getUtilityIconUrl } from '$lib/data/visual-assets';
  import type { PublicSiteVersion } from '$lib/domain/types';
  import { localizedHref } from '$lib/i18n/routing';
  import { siteName } from '$lib/site';
  import PrimaryNavigation from './PrimaryNavigation.svelte';
  import SearchBar from '../search/SearchBar.svelte';

  export let siteVersion: PublicSiteVersion;
  export let onOpenChangelog: () => void = () => undefined;

  let returnFocus: HTMLButtonElement | undefined;
  let expanded = false;
  const trainPartyIconUrl = getBrandIconUrl('train-party');
  const changelogIconUrl = getUtilityIconUrl('changelog');
  const homeHref = localizedHref('/');
  const name = siteName();

  $: revision = siteVersion.dataRevision;
  $: versionLabel = siteVersion.gameVersion
    ? m.navigation_data_version({ version: siteVersion.gameVersion })
    : m.navigation_unknown_version();
  $: snapshotLabel = m.navigation_snapshot({ versionLabel, revision });

  function openNavigator(event: MouseEvent) {
    returnFocus = event.currentTarget as HTMLButtonElement;
    expanded = !expanded;
  }
  function closeNavigator() {
    expanded = false;
  }
  afterNavigate(closeNavigator);
</script>

<Sheet.Root bind:open={expanded}>
  <aside class="navigator-rail" aria-label={m.navigation_compact_aria()}>
    <a
      class="brand navigator-rail__brand"
      href={homeHref}
      aria-label={m.navigation_home_aria({ siteName: name })}
    >
      <span class="brand-icon" aria-hidden="true">
        <AssetImage src={trainPartyIconUrl} alt="" fallbackClass="brand-image-fallback" />
      </span>
    </a>
    <button
      class="navigator-toggle"
      type="button"
      aria-label={m.navigation_open()}
      aria-expanded={expanded}
      aria-controls="primary-navigator-pane"
      on:click={openNavigator}
    >
      <span aria-hidden="true"><i></i><i></i><i></i></span>
    </button>
    <button
      class="changelog-trigger"
      type="button"
      aria-label={m.navigation_changelog()}
      on:click={onOpenChangelog}
    >
      <AssetImage src={changelogIconUrl} alt="" fallbackClass="utility-image-fallback" />
      <span class="changelog-trigger__tooltip" role="tooltip">{m.navigation_changelog()}</span>
    </button>
    <PrimaryNavigation pathname={$page.url.pathname} compact />
    <div class="navigator-rail__snapshot" role="status" aria-label={snapshotLabel}>
      <span class="snapshot-dot" aria-hidden="true"></span>
      <span class="navigator-rail__tooltip" role="tooltip">{snapshotLabel}</span>
    </div>
  </aside>

  <header class="mobile-header">
    <a class="brand" href={homeHref}>
      <span class="brand-icon" aria-hidden="true">
        <AssetImage src={trainPartyIconUrl} alt="" fallbackClass="brand-image-fallback" />
      </span><strong>{name}</strong>
    </a>
    <div class="mobile-header__actions">
      <button
        class="changelog-trigger mobile-header__changelog"
        type="button"
        aria-label={m.navigation_changelog()}
        on:click={onOpenChangelog}
      >
        <AssetImage src={changelogIconUrl} alt="" fallbackClass="utility-image-fallback" />
        <span class="changelog-trigger__tooltip" role="tooltip">{m.navigation_changelog()}</span>
      </button>
      <button
        class="navigator-toggle"
        type="button"
        aria-label={m.navigation_open()}
        aria-expanded={expanded}
        aria-controls="primary-navigator-pane"
        on:click={openNavigator}
      >
        <span aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
    </div>
  </header>

  <Sheet.Content
    id="primary-navigator-pane"
    side="left"
    showCloseButton={false}
    aria-describedby={undefined}
    class="navigator-pane w-[min(88vw,320px)]! gap-6 overflow-y-auto p-4"
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }}
  >
    <Sheet.Title class="sr-only">{m.navigation_full_aria()}</Sheet.Title>
    <div class="navigator-pane__heading">
      <a class="brand navigator-pane__brand" href={homeHref} on:click={closeNavigator}>
        <span class="brand-icon" aria-hidden="true">
          <AssetImage src={trainPartyIconUrl} alt="" fallbackClass="brand-image-fallback" />
        </span>
        <span><strong>{name}</strong><small>{m.site_short_tagline()}</small></span>
      </a>
      <button
        class="navigator-toggle"
        type="button"
        aria-label={m.navigation_close()}
        aria-expanded={expanded}
        aria-controls="primary-navigator-pane"
        on:click={closeNavigator}
      >
        <span aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
    </div>

    <SearchBar
      id="global-search"
      label={m.navigation_search_label()}
      placeholder={m.navigation_search_placeholder()}
      variant="sidebar"
    />

    <PrimaryNavigation pathname={$page.url.pathname} onSelect={closeNavigator} />

    <div class="navigator-pane__snapshot" aria-label={snapshotLabel}>
      <span class="snapshot-dot" aria-hidden="true"></span>
      <div><strong>{versionLabel}</strong><small>{revision}</small></div>
    </div>
  </Sheet.Content>
</Sheet.Root>
