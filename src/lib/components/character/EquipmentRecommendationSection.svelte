<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import type { EquipmentRecommendationView } from '$lib/domain/equipment-recommendation-view';
  import { localizedHref } from '$lib/i18n/routing';
  import { relicCategoryLabel, relicSlotLabel } from '$lib/i18n/product';
  import { m } from '$lib/paraglide/messages.js';
  import { getLightConePreviewUrl, getRelicSetIconUrl } from '$lib/data/visual-assets';
  import CompactEntityCard from '../shared/CompactEntityCard.svelte';
  import GameText from '../shared/GameText.svelte';
  import RarityStars from '../shared/RarityStars.svelte';
  import RelicPropertyToken from '../relic/RelicPropertyToken.svelte';
  import SectionHeading from '../shared/SectionHeading.svelte';
  import SemanticIconLabel from '../shared/SemanticIconLabel.svelte';

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
    <SectionHeading level={2}>{relicCategoryLabel('cavern')}</SectionHeading>
    <div class="compact-entity-grid">
      {#each recommendation.cavernSets as relicSet (relicSet.id)}
        <CompactEntityCard
          href={localizedHref(`/relics/${relicSet.id}`)}
          imageUrl={getRelicSetIconUrl(relicSet.id)}
        >
          <svelte:fragment slot="title"><GameText text={relicSet.name} /></svelte:fragment>
          <svelte:fragment slot="secondary">{relicCategoryLabel('cavern')}</svelte:fragment>
        </CompactEntityCard>
      {/each}
    </div>
  </div>
  <div class="equipment-recommendation__group">
    <SectionHeading level={2}>{relicCategoryLabel('planar')}</SectionHeading>
    <div class="compact-entity-grid">
      {#each recommendation.planarSets as relicSet (relicSet.id)}
        <CompactEntityCard
          href={localizedHref(`/relics/${relicSet.id}`)}
          imageUrl={getRelicSetIconUrl(relicSet.id)}
        >
          <svelte:fragment slot="title"><GameText text={relicSet.name} /></svelte:fragment>
          <svelte:fragment slot="secondary">{relicCategoryLabel('planar')}</svelte:fragment>
        </CompactEntityCard>
      {/each}
    </div>
  </div>

  <div class="equipment-recommendation__group">
    <SectionHeading level={2}>{m.equipment_recommended_stats()}</SectionHeading>
    <Card.Root class="recommendation-stats-surface @container/recommendation-stats gap-4 py-4">
      <Card.Content
        class="recommendation-main-stats grid grid-cols-1 gap-4 px-4 @min-[28rem]/recommendation-stats:grid-cols-2 @min-[54rem]/recommendation-stats:grid-cols-4"
      >
        {#each recommendation.mainStats as stat (stat.slot)}
          <section
            class="recommendation-main-stat flex min-w-0 flex-col gap-3"
            data-relic-slot={stat.slot}
          >
            <h4 class="text-muted-foreground m-0 text-sm font-semibold">
              {relicSlotLabel(stat.slot)}
            </h4>
            <div class="grid gap-2">
              {#each stat.properties as property (property.propertyType)}
                <RelicPropertyToken {property} />
              {/each}
            </div>
          </section>
        {/each}
      </Card.Content>
      <Separator />
      <Card.Content class="recommendation-substats flex flex-col gap-3 px-4">
        <h4 class="text-muted-foreground m-0 text-sm font-semibold">{m.equipment_substats()}</h4>
        <div class="flex flex-wrap gap-2">
          {#each recommendation.subStats as property (property.propertyType)}
            <RelicPropertyToken {property} chip />
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</section>
