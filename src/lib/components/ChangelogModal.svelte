<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { changelogEntries } from '$lib/content/changelog';
  import {
    CHANGELOG_DISMISSED_DATE_KEY,
    dismissChangelogForToday,
    localDateKey,
    shouldAutoOpenChangelog
  } from '$lib/domain/changelog';

  let dialog: HTMLDialogElement;
  let closeButton: HTMLButtonElement;
  let surface: HTMLElement;
  let scrollLocked = false;
  let previousBodyOverflow = '';
  let previousRootOverflow = '';

  function lockScroll() {
    if (scrollLocked) return;
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    scrollLocked = true;
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousRootOverflow;
    scrollLocked = false;
  }

  async function focusCloseButton() {
    await tick();
    closeButton?.focus();
  }

  export function open() {
    if (dialog?.open) return;
    lockScroll();
    dialog.showModal();
    void focusCloseButton();
  }

  function close() {
    if (dialog?.open) dialog.close();
  }

  function dismissToday() {
    dismissChangelogForToday(
      typeof localStorage === 'undefined' ? undefined : localStorage,
      localDateKey()
    );
    close();
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    close();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target !== dialog) return;
    const bounds = surface.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      close();
  }

  function handleClose() {
    unlockScroll();
  }

  onMount(() => {
    let dismissedDate: string | null = null;
    try {
      dismissedDate = localStorage.getItem(CHANGELOG_DISMISSED_DATE_KEY);
    } catch {
      // localStorage may be unavailable; treat this session as not dismissed.
    }
    if (shouldAutoOpenChangelog(changelogEntries.length, dismissedDate)) open();
  });

  onDestroy(unlockScroll);
</script>

<dialog
  class="changelog-dialog"
  aria-labelledby="changelog-dialog-title"
  bind:this={dialog}
  on:cancel={handleCancel}
  on:close={handleClose}
  on:click={handleBackdropClick}
>
  <section class="changelog-dialog__surface" bind:this={surface}>
    <header class="changelog-dialog__header">
      <div>
        <p class="kicker">SITE UPDATES</p>
        <h2 id="changelog-dialog-title">更新日志</h2>
      </div>
      <button
        class="changelog-dialog__close"
        type="button"
        aria-label="关闭更新日志"
        bind:this={closeButton}
        on:click={close}>×</button
      >
    </header>

    <div class="changelog-dialog__content">
      {#if changelogEntries.length}
        {#each changelogEntries as entry (entry.id)}
          <article class="changelog-entry">
            <div class="changelog-entry__heading">
              <h3>{entry.title}</h3>
              <time datetime={entry.date}>{entry.date}</time>
            </div>
            <div class="changelog-entry__body">
              <svelte:component this={entry.component} />
            </div>
          </article>
        {/each}
      {:else}
        <p class="changelog-dialog__empty">暂无更新日志。</p>
      {/if}
    </div>

    <footer class="changelog-dialog__footer">
      <button type="button" class="changelog-dialog__today" on:click={dismissToday}>今日关闭</button
      >
      <button type="button" class="button-primary" on:click={close}>关闭</button>
    </footer>
  </section>
</dialog>

<style>
  .changelog-dialog {
    width: min(44rem, calc(100vw - 2rem));
    max-width: none;
    max-height: min(44rem, calc(100vh - 2rem));
    margin: auto;
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 24px 80px rgb(0 0 0 / 42%);
    padding: 0;
  }

  .changelog-dialog::backdrop {
    background: rgb(3 5 10 / 72%);
    backdrop-filter: blur(6px);
  }

  .changelog-dialog__surface {
    display: grid;
    max-height: min(44rem, calc(100vh - 2rem));
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .changelog-dialog__header,
  .changelog-dialog__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: rgb(14 20 34 / 96%);
    padding: 1.25rem 1.4rem;
  }

  .changelog-dialog__header {
    border-bottom: 1px solid var(--border);
  }

  .changelog-dialog__header h2 {
    margin: 0;
    font-size: 1.55rem;
  }

  .changelog-dialog__header .kicker {
    margin-bottom: 0.25rem;
  }

  .changelog-dialog__close {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.5rem;
    line-height: 1;
  }

  .changelog-dialog__close:hover {
    border-color: var(--border-strong);
    color: var(--gold-soft);
  }

  .changelog-dialog__content {
    min-height: 0;
    overflow-y: auto;
    padding: 0.35rem 1.4rem;
  }

  .changelog-entry {
    padding: 1.15rem 0;
  }

  .changelog-entry + .changelog-entry {
    border-top: 1px solid var(--border);
  }

  .changelog-entry__heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }

  .changelog-entry__heading h3 {
    margin: 0;
    font-size: 1.22rem;
    font-weight: 750;
  }

  .changelog-entry__heading time {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .changelog-entry__body :global(p),
  .changelog-entry__body :global(ul),
  .changelog-entry__body :global(ol) {
    margin: 0.7rem 0 0;
  }

  .changelog-entry__body {
    font-size: 0.9rem;
  }

  .changelog-entry__body :global(ul),
  .changelog-entry__body :global(ol) {
    padding-left: 1.3rem;
  }

  .changelog-entry__body :global(a) {
    color: var(--gold-soft);
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  .changelog-dialog__empty {
    margin: 1.5rem 0;
  }

  .changelog-dialog__footer {
    justify-content: flex-end;
    border-top: 1px solid var(--border);
  }

  .changelog-dialog__today,
  .button-primary {
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 0.65rem 0.9rem;
  }

  .changelog-dialog__today {
    background: transparent;
    color: var(--text-secondary);
  }

  .button-primary {
    border-color: var(--gold);
    background: var(--gold);
    color: #15120b;
    font-weight: 700;
  }

  @media (max-width: 560px) {
    .changelog-dialog {
      width: calc(100vw - 1rem);
      max-height: calc(100vh - 1rem);
    }

    .changelog-dialog__surface {
      max-height: calc(100vh - 1rem);
    }

    .changelog-dialog__header,
    .changelog-dialog__footer,
    .changelog-dialog__content {
      padding-right: 1rem;
      padding-left: 1rem;
    }

    .changelog-entry__heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
