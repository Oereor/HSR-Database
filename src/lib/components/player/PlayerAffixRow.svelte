<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getRelicPropertyIconUrl } from '$lib/data/visual-assets';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerRelicAffixView } from '$lib/player/equipment';

  export let affix: PlayerRelicAffixView;
  export let presentation: 'main' | 'sub' = 'sub';

  $: imageUrl = getRelicPropertyIconUrl(affix.property?.iconKey);
</script>

<div
  class:player-affix-row--recommended={affix.recommended}
  class:player-affix-row--main={presentation === 'main'}
  class="player-affix-row"
  data-affix-type={affix.type}
  data-recommended={affix.recommended}
>
  <span class="player-affix-row__identity">
    <AssetImage decorative src={imageUrl} alt="" loading="lazy" decoding="async" />
    <span>{affix.property?.name ?? affix.type}</span>
  </span>
  <strong>{affix.display}</strong>
  {#if affix.count !== undefined && affix.count > 0}<span class="player-affix-row__count">
      <span aria-hidden="true">×{affix.count}</span>
      <span class="player-affix-row__sr-only"
        >{m.player_equipment_enhancement_count({ count: affix.count })}</span
      >
    </span>{/if}
</div>

<style>
  .player-affix-row {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.35rem 0.65rem;
    border-left: 2px solid transparent;
    padding: 0.38rem 0.5rem;
    color: var(--text-secondary);
    font-size: var(--font-internal);
  }

  .player-affix-row--recommended {
    border-left-color: var(--gold);
    background: rgb(215 181 109 / 7%);
  }

  .player-affix-row__identity {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.45rem;
    overflow-wrap: anywhere;
  }

  .player-affix-row__identity :global(img) {
    width: 1.15rem;
    height: 1.15rem;
    flex: 0 0 auto;
    object-fit: contain;
  }

  .player-affix-row strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  .player-affix-row__count {
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .player-affix-row--main {
    padding-block: 0.5rem;
    font-size: var(--font-body);
    font-weight: 600;
  }

  .player-affix-row--main strong {
    font-size: var(--font-meta-value);
  }

  .player-affix-row__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
