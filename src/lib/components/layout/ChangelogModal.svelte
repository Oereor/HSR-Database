<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import {
    formatChangelogDate,
    loadChangelogEntries,
    type ChangelogEntry
  } from '$lib/content/changelog';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import {
    CHANGELOG_DISMISSED_DATE_KEY,
    dismissChangelogForToday,
    localDateKey,
    shouldAutoOpenChangelog
  } from '$lib/domain/changelog';

  export let locale: Locale;

  let changelogEntries: ChangelogEntry[] = [];
  let loadedLocale: Locale | undefined;

  let isOpen = false;
  let returnFocus: HTMLElement | undefined;
  let requestVersion = 0;
  afterNavigate(() => {
    requestVersion++;
    isOpen = false;
  });

  async function ensureEntries() {
    const requestedLocale = locale;
    const entries = await loadChangelogEntries(requestedLocale);
    if (locale !== requestedLocale) return ensureEntries();
    loadedLocale = requestedLocale;
    changelogEntries = entries;
  }

  export async function open() {
    const version = requestVersion;
    const active = document.activeElement;
    if (loadedLocale !== locale) await ensureEntries();
    if (version !== requestVersion || isOpen) return;
    returnFocus = active instanceof HTMLElement ? active : undefined;
    isOpen = true;
  }
  function close() {
    isOpen = false;
  }

  function dismissToday() {
    dismissChangelogForToday(
      typeof localStorage === 'undefined' ? undefined : localStorage,
      localDateKey()
    );
    close();
  }

  onMount(() => {
    void initialize();
  });

  async function initialize() {
    await ensureEntries();
    let dismissedDate: string | null = null;
    try {
      dismissedDate = localStorage.getItem(CHANGELOG_DISMISSED_DATE_KEY);
    } catch {
      // localStorage may be unavailable; treat this session as not dismissed.
    }
    if (shouldAutoOpenChangelog(changelogEntries.length, dismissedDate)) await open();
  }
</script>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Content
    showCloseButton={false}
    aria-describedby={undefined}
    class="changelog-dialog flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
    onCloseAutoFocus={(event) => {
      if (returnFocus?.isConnected) {
        event.preventDefault();
        returnFocus.focus({ preventScroll: true });
      }
      returnFocus = undefined;
    }}
  >
    <header
      class="border-border flex shrink-0 items-start justify-between gap-4 border-b p-4 sm:p-6"
    >
      <div>
        <p class="kicker">{m.changelog_eyebrow()}</p>
        <Dialog.Title id="changelog-dialog-title" class="text-xl"
          >{m.changelog_title()}</Dialog.Title
        >
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="changelog-dialog__close"
        aria-label={m.changelog_close_aria()}
        onclick={close}>×</Button
      >
    </header>
    <div class="changelog-dialog__content min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
      {#if changelogEntries.length}
        {#each changelogEntries as entry (entry.id)}
          <article class="changelog-entry">
            <div class="changelog-entry__heading">
              <h3>{entry.title}</h3>
              <time datetime={entry.date}>{formatChangelogDate(entry.date, locale)}</time>
            </div>
            <div class="changelog-entry__body">
              <svelte:component this={entry.component} />
            </div>
          </article>
        {/each}
      {:else}
        <p class="changelog-dialog__empty">{m.changelog_empty()}</p>
      {/if}
    </div>

    <div class="border-border flex shrink-0 flex-wrap justify-end gap-2 border-t p-4">
      <Button variant="outline" class="changelog-dialog__today" onclick={dismissToday}
        >{m.changelog_dismiss_today()}</Button
      >
      <Button class="button-primary" onclick={close}>{m.common_close()}</Button>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .changelog-entry + .changelog-entry {
    margin-top: var(--space-8);
    padding-top: var(--space-6);
    border-top: 1px solid var(--border);
  }
  .changelog-entry__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .changelog-entry__heading h3 {
    margin: 0;
    font-size: var(--font-major-title);
  }
  .changelog-entry__heading time {
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }
  .changelog-entry__body :global(p),
  .changelog-entry__body :global(li) {
    color: var(--text-body);
    line-height: 1.7;
  }
  .changelog-entry__body :global(ul),
  .changelog-entry__body :global(ol) {
    padding-left: 1.5rem;
  }
  .changelog-entry__body :global(a) {
    color: var(--gold-soft);
    text-decoration: underline;
  }
</style>
