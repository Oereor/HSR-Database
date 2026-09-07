<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { getUtilityIconUrl } from '$lib/data/visual-assets';
  import { localeCounterpartHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { tick } from 'svelte';

  export let locale: Locale;

  let root: HTMLElement;
  let trigger: HTMLButtonElement;
  let open = false;
  const settingsIconUrl = getUtilityIconUrl('settings');

  $: currentHref = `${$page.url.pathname}${browser ? $page.url.search : ''}${browser ? $page.url.hash : ''}`;
  $: chineseHref = localeCounterpartHref(currentHref, 'zh-CN');
  $: englishHref = localeCounterpartHref(currentHref, 'en');

  function toggle() {
    open = !open;
  }

  function close(returnFocus = false) {
    if (!open) return;
    open = false;
    if (returnFocus) void tick().then(() => trigger?.focus());
  }

  function handleWindowClick(event: MouseEvent) {
    if (open && !root?.contains(event.target as Node)) close();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
    }
  }

  function keepCurrentLocale(event: MouseEvent) {
    event.preventDefault();
  }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} />

<div class="settings-control" bind:this={root}>
  {#if open}
    <section id="site-settings-panel" class="settings-panel" aria-label={m.settings_label()}>
      <div class="settings-panel__heading">
        <strong>{m.settings_language()}</strong>
        <button type="button" aria-label={m.settings_close()} on:click={() => close(true)}>×</button
        >
      </div>
      <div class="language-segments" role="group" aria-label={m.settings_language()}>
        <a
          class:selected={locale === 'zh-CN'}
          aria-current={locale === 'zh-CN' ? 'true' : undefined}
          aria-label={m.settings_switch_to({ language: '中文' })}
          href={chineseHref}
          data-sveltekit-reload
          on:click={locale === 'zh-CN' ? keepCurrentLocale : undefined}>中文</a
        >
        <a
          class:selected={locale === 'en'}
          aria-current={locale === 'en' ? 'true' : undefined}
          aria-label={m.settings_switch_to({ language: 'EN' })}
          href={englishHref}
          data-sveltekit-reload
          on:click={locale === 'en' ? keepCurrentLocale : undefined}>EN</a
        >
      </div>
    </section>
  {/if}
  <button
    class="settings-trigger"
    type="button"
    aria-label={open ? m.settings_close() : m.settings_open()}
    title={m.settings_label()}
    aria-expanded={open}
    aria-controls="site-settings-panel"
    bind:this={trigger}
    on:click={toggle}
  >
    {#if settingsIconUrl}<img src={settingsIconUrl} alt="" />{:else}<span aria-hidden="true">?</span
      >{/if}
  </button>
</div>

<style>
  .settings-control {
    position: fixed;
    z-index: 30;
    right: max(var(--space-4), env(safe-area-inset-right));
    bottom: max(var(--space-4), env(safe-area-inset-bottom));
    display: grid;
    justify-items: end;
    gap: var(--space-2);
  }

  .settings-trigger {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: rgb(14 20 34 / 96%);
    color: var(--gold-soft);
    box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
    padding: 0;
    transition:
      border-color var(--motion),
      background var(--motion),
      transform var(--motion);
  }

  .settings-trigger:hover {
    border-color: var(--gold);
    background: rgb(25 35 53 / 98%);
    transform: translateY(-1px);
  }

  .settings-trigger img {
    width: 27px;
    height: 27px;
    object-fit: contain;
  }

  .settings-panel {
    width: min(220px, calc(100vw - 2rem));
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: rgb(14 20 34 / 98%);
    box-shadow: 0 14px 36px rgb(0 0 0 / 34%);
    padding: var(--space-3);
  }

  .settings-panel__heading {
    display: flex;
    min-height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .settings-panel__heading strong {
    font-size: var(--font-internal);
  }

  .settings-panel__heading button {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.2rem;
    padding: 0;
  }

  .language-segments {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }

  .language-segments a {
    display: grid;
    min-height: 38px;
    place-items: center;
    color: var(--text-secondary);
    font-size: var(--font-internal);
    font-weight: 700;
  }

  .language-segments a + a {
    border-left: 1px solid var(--border);
  }

  .language-segments a:hover,
  .language-segments a.selected {
    background: rgb(215 181 109 / 14%);
    color: var(--gold-soft);
  }

  @media (max-width: 520px) {
    .settings-control {
      right: max(var(--space-3), env(safe-area-inset-right));
      bottom: max(var(--space-3), env(safe-area-inset-bottom));
    }
  }
</style>
