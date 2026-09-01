<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import { getBrandIconUrl } from '$lib/data/visual-assets';
  import type { DataManifest } from '$lib/domain/types';
  import PrimaryNavigation from './PrimaryNavigation.svelte';

  export let manifest: DataManifest;

  let navigatorPane: HTMLDialogElement;
  let expanded = false;
  const trainPartyIconUrl = getBrandIconUrl('train-party');

  $: revision = manifest.sourceCommit.slice(0, 8);
  $: versionLabel = manifest.gameVersion ? `数据版本 ${manifest.gameVersion}` : '数据版本未知';
  $: snapshotLabel = `${versionLabel} · ${revision}`;

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

<aside class="navigator-rail" aria-label="紧凑导航栏">
  <a class="brand navigator-rail__brand" href="/" aria-label="星轨档案库首页">
    <span class="brand-mark brand-mark--train-party" aria-hidden="true">
      {#if trainPartyIconUrl}<img src={trainPartyIconUrl} alt="" />{:else}轨{/if}
    </span>
  </a>
  <button
    class="navigator-toggle"
    type="button"
    aria-label="打开导航"
    aria-expanded={expanded}
    aria-controls="primary-navigator-pane"
    on:click={openNavigator}
  >
    <span aria-hidden="true"><i></i><i></i><i></i></span>
  </button>
  <PrimaryNavigation pathname={$page.url.pathname} compact />
  <div class="navigator-rail__snapshot" role="status" aria-label={snapshotLabel}>
    <span class="snapshot-dot" aria-hidden="true"></span>
    <span class="navigator-rail__tooltip" role="tooltip">{snapshotLabel}</span>
  </div>
</aside>

<header class="mobile-header">
  <a class="brand" href="/">
    <span class="brand-mark" aria-hidden="true">轨</span><strong>星轨档案库</strong>
  </a>
  <button
    class="navigator-toggle"
    type="button"
    aria-label="打开导航"
    aria-expanded={expanded}
    aria-controls="primary-navigator-pane"
    on:click={openNavigator}
  >
    <span aria-hidden="true"><i></i><i></i><i></i></span>
  </button>
</header>

<dialog
  id="primary-navigator-pane"
  class="navigator-pane"
  bind:this={navigatorPane}
  aria-label="完整导航"
  on:click={handlePaneClick}
  on:close={handlePaneClose}
  on:cancel={handlePaneClose}
>
  <div class="navigator-pane__surface">
    <div class="navigator-pane__heading">
      <a class="brand navigator-pane__brand" href="/" on:click={closeNavigator}>
        <span class="brand-mark brand-mark--train-party" aria-hidden="true">
          {#if trainPartyIconUrl}<img src={trainPartyIconUrl} alt="" />{:else}轨{/if}
        </span>
        <span><strong>崩坏：星穹铁道 档案库</strong><small>HSR Data Archive</small></span>
      </a>
      <button
        class="navigator-toggle"
        type="button"
        aria-label="关闭导航"
        aria-expanded={expanded}
        aria-controls="primary-navigator-pane"
        on:click={closeNavigator}
      >
        <span aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
    </div>

    <form class="navigator-search" action="/search" role="search">
      <label for="global-search">全局搜索</label>
      <div>
        <input id="global-search" name="q" placeholder="搜索角色、光锥…" />
        <button type="submit" aria-label="开始搜索">⌕</button>
      </div>
    </form>

    <PrimaryNavigation pathname={$page.url.pathname} onSelect={closeNavigator} />

    <div class="navigator-pane__snapshot" aria-label={snapshotLabel}>
      <span class="snapshot-dot" aria-hidden="true"></span>
      <div><strong>{versionLabel}</strong><small>{revision}</small></div>
    </div>
  </div>
</dialog>
