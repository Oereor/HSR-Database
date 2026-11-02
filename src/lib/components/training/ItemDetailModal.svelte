<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
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

  $: rarity = material ? rarityFromCode(material.rarity) : undefined;
</script>

<Dialog.Root
  open={!!material}
  onOpenChange={(next) => {
    if (!next && material) onRequestClose();
  }}
>
  <Dialog.Content
    showCloseButton={false}
    aria-describedby={undefined}
    data-item-detail-state={state}
    data-item-detail-id={material?.id}
    class="item-detail-modal flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      onClosed();
    }}
  >
    <div class="flex shrink-0 justify-end px-3 pt-3">
      <Button
        variant="ghost"
        size="icon"
        class="item-detail-modal__close"
        aria-label={m.material_detail_close({}, { locale })}
        onclick={onRequestClose}>×</Button
      >
    </div>
    <div
      class="item-detail-modal__content grid min-h-0 gap-6 overflow-y-auto overscroll-contain p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:p-6"
    >
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
          <Dialog.Title id="item-detail-title" class="text-xl leading-snug"
            ><GameText text={material.name} /></Dialog.Title
          >
          {#if state === 'loading'}
            <p class="item-detail-modal__status" role="status">
              {m.material_detail_loading({}, { locale })}
            </p>
          {:else if state === 'error'}
            <div class="item-detail-modal__status" role="status">
              <p>{m.material_detail_error({}, { locale })}</p>
              <Button variant="outline" class="item-detail-modal__retry mt-3" onclick={onRetry}
                >{m.material_detail_retry({}, { locale })}</Button
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
  </Dialog.Content>
</Dialog.Root>

<style>
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
  .item-detail-modal__description {
    margin-top: var(--space-4);
    color: var(--text-body);
    font-weight: 600;
  }
  .item-detail-modal__background {
    margin-top: var(--space-6);
    color: var(--text-secondary);
  }
  .item-detail-modal__status {
    margin-top: var(--space-4);
    color: var(--text-secondary);
  }
</style>
