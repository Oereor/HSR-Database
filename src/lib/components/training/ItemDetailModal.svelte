<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import RarityStars from '$lib/components/shared/RarityStars.svelte';
  import { resolveMaterialIconAsset } from '$lib/data/visual-assets';
  import { rarityFromCode } from '$lib/domain/constants';
  import { getRarityColor } from '$lib/domain/rarity';
  import type { MaterialDetail, MaterialView } from '$lib/domain/training/types';
  import { m } from '$lib/paraglide/messages.js';

  export let material: MaterialView | undefined = undefined;
  export let detail: MaterialDetail | undefined = undefined;
  export let locale: 'zh-CN' | 'en';
  export let state: 'loading' | 'ready' | 'error' = 'loading';
  export let onRequestClose: () => void;
  export let onClosed: () => void;
  export let onRetry: () => void;

  let dialog: HTMLDialogElement;
  let surface: HTMLElement;
  let closeButton: HTMLButtonElement;
  let synchronizedOpen = false;
  let previousBodyOverflow = '';
  let previousRootOverflow = '';
  let scrollLocked = false;
  let destroyed = false;

  $: rarity = material ? rarityFromCode(material.rarity) : undefined;
  $: if (dialog && !!material !== synchronizedOpen) synchronizeDialog(!!material);

  async function synchronizeDialog(open: boolean) {
    synchronizedOpen = open;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!scrollLocked) {
      previousBodyOverflow = document.body.style.overflow;
      previousRootOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      scrollLocked = true;
    }
    dialog.showModal();
    await tick();
    if (!destroyed && dialog.open) closeButton.focus({ preventScroll: true });
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousRootOverflow;
    scrollLocked = false;
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    onRequestClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>('button, a[href], [tabindex]')
    ].filter((control) => control.tabIndex >= 0 && control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
      onRequestClose();
  }

  function handleClose() {
    // A queued close event must not unlock or clear a subsequently reopened dialog.
    if (destroyed || dialog.open) return;
    unlockScroll();
    if (material) onRequestClose();
    onClosed();
  }

  onDestroy(() => {
    destroyed = true;
    if (dialog?.open) dialog.close();
    unlockScroll();
  });
</script>

<dialog
  class="item-detail-modal"
  aria-labelledby="item-detail-title"
  data-item-detail-state={state}
  data-item-detail-id={material?.id}
  bind:this={dialog}
  on:cancel={handleCancel}
  on:keydown={handleKeydown}
  on:close={handleClose}
  on:click={handleBackdropClick}
>
  <section class="item-detail-modal__surface" bind:this={surface}>
    <div class="item-detail-modal__controls">
      <button
        class="item-detail-modal__close"
        type="button"
        aria-label={m.material_detail_close({}, { locale })}
        bind:this={closeButton}
        on:click={onRequestClose}>×</button
      >
    </div>
    <div class="item-detail-modal__content">
      {#if material}
        <div class="item-detail-modal__visual">
          <div
            class="item-detail-modal__icon"
            style={`--item-rarity: ${getRarityColor(rarity) ?? 'var(--border)'}`}
          >
            <AssetImage
              src={resolveMaterialIconAsset(material.iconKey)}
              alt=""
              width={160}
              height={160}
              decoding="async"
            />
          </div>
          {#if rarity !== undefined && rarity >= 2 && rarity <= 5}
            <RarityStars {rarity} size="hero" />
          {/if}
        </div>
        <div class="item-detail-modal__text">
          <h2 id="item-detail-title"><GameText text={material.name} /></h2>
          {#if state === 'loading'}
            <p class="item-detail-modal__status" role="status">
              {m.material_detail_loading({}, { locale })}
            </p>
          {:else if state === 'error'}
            <div class="item-detail-modal__status" role="status">
              <p>{m.material_detail_error({}, { locale })}</p>
              <button type="button" class="item-detail-modal__retry" on:click={onRetry}
                >{m.material_detail_retry({}, { locale })}</button
              >
            </div>
          {:else if detail?.id === material.id}
            {#if detail.description}<p class="item-detail-modal__description">
                <GameText text={detail.description} />
              </p>{/if}
            {#if detail.backgroundDescription}<p class="item-detail-modal__background">
                <GameText text={detail.backgroundDescription} />
              </p>{/if}
          {/if}
        </div>
      {/if}
    </div>
  </section>
</dialog>

<style>
  .item-detail-modal {
    width: 100vw;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: var(--space-4);
    border: 0;
    background: transparent;
    color: var(--text);
    overflow: hidden;
  }
  .item-detail-modal[open] {
    display: grid;
    place-items: center;
  }
  .item-detail-modal::backdrop {
    background: rgb(3 6 12 / 76%);
  }
  .item-detail-modal__surface {
    width: min(100%, 760px);
    max-height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface);
    box-shadow: 0 24px 80px rgb(0 0 0 / 38%);
    overflow: hidden;
  }
  .item-detail-modal__controls {
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
    padding: var(--space-3) var(--space-3) 0;
  }
  .item-detail-modal__close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.75rem;
    line-height: 1;
  }
  .item-detail-modal__close:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .item-detail-modal__content {
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr);
    gap: var(--space-6);
    padding: var(--space-2) var(--space-8) var(--space-8);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .item-detail-modal__visual {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .item-detail-modal__icon {
    width: 160px;
    aspect-ratio: 1;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--item-rarity) 8%, transparent);
    display: grid;
    place-items: center;
  }
  .item-detail-modal__icon :global(img),
  .item-detail-modal__icon :global(.image-fallback) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .item-detail-modal__text {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  h2 {
    margin: 0;
    font-size: var(--font-section-title);
    line-height: 1.4;
  }
  p {
    margin: 0;
  }
  .item-detail-modal__description {
    margin-top: var(--space-4);
    color: var(--text-body);
    font-weight: 600;
    line-height: 1.7;
  }
  .item-detail-modal__background {
    margin-top: var(--space-6);
    color: var(--text-secondary);
    line-height: 1.8;
  }
  .item-detail-modal__status {
    margin-top: var(--space-4);
    color: var(--text-secondary);
  }
  .item-detail-modal__retry {
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
  }
  @media (max-width: 639px) {
    .item-detail-modal__content {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--space-2) var(--space-6) var(--space-6);
    }
    .item-detail-modal__icon {
      width: min(128px, 100%);
    }
  }
</style>
