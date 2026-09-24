<script lang="ts">
  import { onMount } from 'svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import type { EquipmentRecommendationView } from '$lib/domain/equipment-recommendation-view';
  import type { RelicProperty } from '$lib/domain/types';
  import type { SearchLocale } from '$lib/domain/search-index';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerCharacter } from '$lib/player/contract';
  import { loadPlayerEquipmentCatalog } from '$lib/player/equipment-client';
  import {
    createPlayerEquipmentCatalogIndex,
    resolvePlayerLightCone,
    resolvePlayerRelicSlots,
    type PlayerEquipmentCatalog
  } from '$lib/player/equipment';
  import PlayerLightConeCard from './PlayerLightConeCard.svelte';
  import PlayerRelicCard from './PlayerRelicCard.svelte';
  import PlayerRelicScoreSummary from './PlayerRelicScoreSummary.svelte';

  export let character: PlayerCharacter;
  export let recommendation: EquipmentRecommendationView | undefined = undefined;
  export let relicProperties: RelicProperty[] = [];
  export let catalog: PlayerEquipmentCatalog | null | undefined = undefined;

  let loadedCatalog: PlayerEquipmentCatalog | null | undefined;
  $: effectiveCatalog = catalog === undefined ? loadedCatalog : catalog;
  $: catalogIndex = effectiveCatalog
    ? createPlayerEquipmentCatalogIndex(effectiveCatalog)
    : effectiveCatalog === null
      ? createPlayerEquipmentCatalogIndex({
          schemaVersion: 1,
          locale: getLocale() as SearchLocale,
          lightCones: [],
          relicSets: []
        })
      : undefined;
  $: lightCone = catalogIndex
    ? resolvePlayerLightCone(character.lightCone, catalogIndex)
    : undefined;
  $: relicSlots = catalogIndex
    ? resolvePlayerRelicSlots(character.relics, catalogIndex, relicProperties, recommendation)
    : [];

  onMount(() => {
    if (catalog !== undefined) return;
    const locale = getLocale() as SearchLocale;
    void loadPlayerEquipmentCatalog(locale).then(
      (value) => (loadedCatalog = value),
      () => (loadedCatalog = null)
    );
  });
</script>

<section id="equipment" class="detail-section player-equipment section-nav-target">
  <SectionHeading level={1}>{m.player_equipment_title()}</SectionHeading>

  {#if !catalogIndex}
    <p class="data-placeholder" aria-live="polite">{m.player_equipment_loading()}</p>
  {:else}
    <div class="player-equipment__group">
      <SectionHeading level={2}>{m.player_equipment_light_cone()}</SectionHeading>
      <PlayerLightConeCard view={lightCone!} />
    </div>

    <div class="player-equipment__group">
      <SectionHeading level={2}>{m.player_equipment_relics()}</SectionHeading>
      {#if character.relicScore}
        <PlayerRelicScoreSummary score={character.relicScore.build} properties={relicProperties} />
      {/if}
      <div class="player-equipment__relic-grid">
        {#each relicSlots as view (view.slot)}
          <PlayerRelicCard
            {view}
            score={character.relicScore?.pieces[view.slot]}
            showScore={!!character.relicScore}
          />
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .player-equipment,
  .player-equipment__group {
    display: grid;
    min-width: 0;
    gap: var(--space-4);
  }

  .player-equipment__group + .player-equipment__group {
    margin-top: var(--space-3);
  }

  .player-equipment__relic-grid {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
  }

  @media (max-width: 1080px) {
    .player-equipment__relic-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 680px) {
    .player-equipment__relic-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
