<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import SkillVariantView from '$lib/components/SkillVariantView.svelte';
  import SpecialEffectRelation from '$lib/components/SpecialEffectRelation.svelte';
  import type { CatalogEntry, CharacterSpecialEffectEntry } from '$lib/domain/types';

  export let open = false;
  export let entries: CharacterSpecialEffectEntry[] = [];
  export let targets: CatalogEntry[] = [];
  export let ownerCharacterId: string;
  export let selectedLevel: number;
  export let onRequestClose: () => void = () => undefined;
  export let onClosed: () => void = () => undefined;

  let dialog: HTMLDialogElement;
  let surface: HTMLElement;
  let closeButton: HTMLButtonElement;
  let previousBodyOverflow = '';
  let previousRootOverflow = '';
  let scrollLocked = false;
  let synchronizedOpen = false;

  $: if (dialog && open !== synchronizedOpen) synchronizeDialog(open);

  function synchronizeDialog(nextOpen: boolean) {
    synchronizedOpen = nextOpen;
    if (nextOpen) showDialog();
    else if (dialog.open) dialog.close();
  }

  async function showDialog() {
    lockScroll();
    dialog.showModal();
    await tick();
    closeButton?.focus();
  }

  function requestClose() {
    if (dialog?.open) onRequestClose();
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    requestClose();
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
      requestClose();
  }

  async function handleClose() {
    unlockScroll();
    onClosed();
    await tick();
    if (open) onRequestClose();
  }

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

  onDestroy(unlockScroll);
</script>

<dialog
  class="special-effect-dialog"
  aria-labelledby="special-effect-dialog-title"
  bind:this={dialog}
  on:cancel={handleCancel}
  on:close={handleClose}
  on:click={handleBackdropClick}
>
  <section class="special-effect-dialog__surface" bind:this={surface}>
    <header class="special-effect-dialog__header">
      <div>
        <p class="kicker">CHARACTER EFFECTS</p>
        <div class="special-effect-dialog__title-row">
          <h2 id="special-effect-dialog-title">特殊效果</h2>
          <span class="skill-effect-tag special-effect-dialog__level">Lv.{selectedLevel}</span>
        </div>
      </div>
      <button
        class="special-effect-dialog__close"
        type="button"
        aria-label="关闭特殊效果"
        bind:this={closeButton}
        on:click={requestClose}>×</button
      >
    </header>
    <div class="special-effect-dialog__content">
      {#if open}
        <div class="skill-variant-list special-effect-entry-list">
          {#each entries as entry (entry.skill.id)}
            <SkillVariantView variant={entry.skill} {selectedLevel}>
              <svelte:fragment slot="prefix"
                ><SpecialEffectRelation {entry} {targets} {ownerCharacterId} /></svelte:fragment
              >
            </SkillVariantView>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</dialog>
