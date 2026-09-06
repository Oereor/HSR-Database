<script lang="ts">
  import type { EquipmentRecommendationView } from '$lib/domain/equipment-recommendation-view';
  import { localizedHref } from '$lib/i18n/routing';
  import { relicCategoryLabel, relicSlotLabel } from '$lib/i18n/product';
  import { m } from '$lib/paraglide/messages.js';
  import { getLightConePreviewUrl, getRelicSetIconUrl } from '$lib/data/visual-assets';
  import CompactEntityCard from './CompactEntityCard.svelte';
  import GameText from './GameText.svelte';
  import RarityStars from './RarityStars.svelte';
  import RelicPropertyToken from './RelicPropertyToken.svelte';
  import SectionHeading from './SectionHeading.svelte';
  import SemanticIconLabel from './SemanticIconLabel.svelte';

  export let recommendation: EquipmentRecommendationView;
</script>

<section
  id="equipment-recommendation"
  class="detail-section equipment-recommendation section-nav-target"
>
  <SectionHeading level={1}>
    {m.detail_equipment_recommendation()}
    <svelte:fragment slot="meta"
      ><span aria-hidden="true">ⓘ</span>
      {m.equipment_source_note()}</svelte:fragment
    >
  </SectionHeading>

  <div class="equipment-recommendation__group">
    <SectionHeading level={2}>{m.equipment_light_cones()}</SectionHeading>
    <div class="compact-entity-grid">
      {#each recommendation.lightCones as lightCone (lightCone.id)}
        <CompactEntityCard
          href={localizedHref(`/light-cones/${lightCone.id}`)}
          imageUrl={getLightConePreviewUrl(lightCone.id)}
          fallbackLabel={lightCone.name}
        >
          <svelte:fragment slot="title"><GameText text={lightCone.name} /></svelte:fragment>
          <svelte:fragment slot="secondary">
            {#if lightCone.rarity}<RarityStars rarity={lightCone.rarity} size="compact" />{/if}
          </svelte:fragment>
          <svelte:fragment slot="tertiary">
            {#if lightCone.pathName}<SemanticIconLabel
                kind="path"
                code={lightCone.path}
                label={lightCone.pathName}
                presentation="path-identity"
              />{/if}
          </svelte:fragment>
        </CompactEntityCard>
      {/each}
    </div>
  </div>

  <div class="equipment-recommendation__group">
    <SectionHeading level={2}>{m.equipment_relics()}</SectionHeading>
    <div class="equipment-recommendation__subgroup">
      <SectionHeading level={3}>{relicCategoryLabel('cavern')}</SectionHeading>
      <div class="compact-entity-grid">
        {#each recommendation.cavernSets as relicSet (relicSet.id)}
          <CompactEntityCard
            href={localizedHref(`/relics/${relicSet.id}`)}
            imageUrl={getRelicSetIconUrl(relicSet.id)}
            fallbackLabel={relicSet.name}
          >
            <svelte:fragment slot="title"><GameText text={relicSet.name} /></svelte:fragment>
            <svelte:fragment slot="secondary">{relicCategoryLabel('cavern')}</svelte:fragment>
          </CompactEntityCard>
        {/each}
      </div>
    </div>
    <div class="equipment-recommendation__subgroup">
      <SectionHeading level={3}>{relicCategoryLabel('planar')}</SectionHeading>
      <div class="compact-entity-grid">
        {#each recommendation.planarSets as relicSet (relicSet.id)}
          <CompactEntityCard
            href={localizedHref(`/relics/${relicSet.id}`)}
            imageUrl={getRelicSetIconUrl(relicSet.id)}
            fallbackLabel={relicSet.name}
          >
            <svelte:fragment slot="title"><GameText text={relicSet.name} /></svelte:fragment>
            <svelte:fragment slot="secondary">{relicCategoryLabel('planar')}</svelte:fragment>
          </CompactEntityCard>
        {/each}
      </div>
    </div>
  </div>

  <div class="equipment-recommendation__group">
    <SectionHeading level={2}>{m.equipment_recommended_stats()}</SectionHeading>
    <article class="recommendation-stats-surface">
      <div class="recommendation-main-stats">
        {#each recommendation.mainStats as stat (stat.slot)}
          <section class="recommendation-main-stat" data-relic-slot={stat.slot}>
            <h4>{relicSlotLabel(stat.slot)}</h4>
            <div>
              {#each stat.properties as property (property.propertyType)}
                <RelicPropertyToken {property} />
              {/each}
            </div>
          </section>
        {/each}
      </div>
      <div class="recommendation-substats">
        <h4>{m.equipment_substats()}</h4>
        <div>
          {#each recommendation.subStats as property (property.propertyType)}
            <RelicPropertyToken {property} chip />
          {/each}
        </div>
      </div>
    </article>
  </div>
</section>
