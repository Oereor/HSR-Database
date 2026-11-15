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
    aria-describedby={undefined}
    class="changelog-dialog max-w-3xl"
    onCloseAutoFocus={(event) => {
      if (returnFocus?.isConnected) {
        event.preventDefault();
        returnFocus.focus({ preventScroll: true });
      }
      returnFocus = undefined;
    }}
  >
    <Dialog.Header>
      <Dialog.Title id="changelog-dialog-title">{m.changelog_title({}, { locale })}</Dialog.Title>
      <Dialog.Close
        label={m.changelog_close_aria({}, { locale })}
        class="changelog-dialog__close"
      />
    </Dialog.Header>
    <Dialog.Body class="changelog-dialog__content">
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
        <p class="changelog-dialog__empty">{m.changelog_empty({}, { locale })}</p>
      {/if}
    </Dialog.Body>

    <div class="border-border flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-6">
      <Button variant="outline" class="changelog-dialog__today" onclick={dismissToday}
        >{m.changelog_dismiss_today({}, { locale })}</Button
      >
      <Button class="button-primary" onclick={close}>{m.common_close({}, { locale })}</Button>
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
