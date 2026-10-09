<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { resolveMaterialIconAsset } from '$lib/data/visual-assets';
  import { rarityFromCode } from '$lib/domain/constants';
  import { getRarityColor } from '$lib/domain/rarity';
  import type { Cost, MaterialCatalog } from '$lib/domain/training/types';
  import { m } from '$lib/paraglide/messages.js';
  export let cost: Cost;
  export let catalog: MaterialCatalog;
  $: number = new Intl.NumberFormat(catalog.locale);
  $: materials = new Map(catalog.materials.map((material) => [material.id, material]));
  $: entries = Object.entries(cost)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ material: materials.get(id)!, count }))
    .sort((a, b) => {
      if (a.material.id === '2') return -1;
      if (b.material.id === '2') return 1;
      return (
        (rarityFromCode(b.material.rarity) ?? 0) - (rarityFromCode(a.material.rarity) ?? 0) ||
        a.material.id.localeCompare(b.material.id, 'en', { numeric: true })
      );
    });
</script>

{#if entries.length}
  <ul class="training-materials">
    {#each entries as { material, count } (material.id)}
      <li
        data-material-id={material.id}
        data-material-count={count}
        style={`--material-rarity: ${getRarityColor(rarityFromCode(material.rarity)) ?? 'var(--border)'}`}
      >
        <div class="training-material__icon">
          <AssetImage
            src={resolveMaterialIconAsset(material.iconKey)}
            alt=""
            width={48}
            height={48}
            loading="lazy"
          />
        </div>
        <div>
          <span class="training-material__name"><GameText text={material.name} /></span><strong
            >{number.format(count)}</strong
          >
        </div>
      </li>
    {/each}
  </ul>
{:else}<p class="muted">{m.training_no_materials()}</p>{/if}

<style>
  .training-materials {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: rgb(14 20 34 / 45%);
  }
  .training-material__icon {
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    border-bottom: 2px solid var(--material-rarity);
    background: color-mix(in srgb, var(--material-rarity) 12%, transparent);
    border-radius: 4px;
    overflow: hidden;
  }
  li > div:last-child {
    min-width: 0;
  }
  .training-material__name {
    display: block;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
    color: var(--text-muted);
  }
  strong {
    font-variant-numeric: tabular-nums;
  }
</style>
