<script lang="ts">
  import '../styles/app.css';
  import '../styles/presentation/detail-hero.css';
  import '../styles/presentation/detail-inspection.css';
  import { page } from '$app/stores';
  import Navigator from '$lib/components/Navigator.svelte';
  import { injectAnalytics } from '@vercel/analytics/sveltekit';
  import { getBrandIconUrl } from '$lib/data/visual-assets';
  import { localeCounterpartHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import { siteName } from '$lib/site';
  import ChangelogModal from '$lib/components/ChangelogModal.svelte';
  import SettingsPopover from '$lib/components/SettingsPopover.svelte';

  injectAnalytics();

  export let data;
  const faviconUrl = getBrandIconUrl('train-party');
  let changelogModal: ChangelogModal;
  // eslint-disable-next-line svelte/no-immutable-reactive-statements
  $: name = siteName();
  $: canonicalPath = $page.url.pathname;
  $: chinesePath = localeCounterpartHref(canonicalPath, 'zh-CN');
  $: englishPath = localeCounterpartHref(canonicalPath, 'en');
</script>

<svelte:head>
  <meta property="og:site_name" content={name} />
  <meta property="og:type" content="website" />
  <link rel="canonical" href={`${data.siteUrl}${canonicalPath}`} />
  <link rel="alternate" hreflang="zh-CN" href={`${data.siteUrl}${chinesePath}`} />
  <link rel="alternate" hreflang="en" href={`${data.siteUrl}${englishPath}`} />
  <link rel="alternate" hreflang="x-default" href={`${data.siteUrl}${chinesePath}`} />
  {#if faviconUrl}<link rel="icon" type="image/png" href={faviconUrl} />{/if}
</svelte:head>

<div class="site-shell">
  <Navigator siteVersion={data.siteVersion} onOpenChangelog={() => changelogModal?.open()} />
  <ChangelogModal locale={data.locale} bind:this={changelogModal} />
  <SettingsPopover locale={data.locale} />

  <main>
    <div class="content"><slot /></div>
    <footer>
      <p>{m.footer_disclaimer()}</p>
      <p>
        {m.footer_data_source()}<a href="https://github.com/DimbreathBot/TurnBasedGameData"
          >TurnBasedGameData</a
        >{m.footer_asset_source()}<a href="https://github.com/Mar-7th/StarRailRes">StarRailRes</a>
        (<a href="/licenses/StarRailRes-AGPL-3.0.txt">{m.footer_license()}</a
        >){m.footer_scope_note()}
      </p>
    </footer>
  </main>
</div>
