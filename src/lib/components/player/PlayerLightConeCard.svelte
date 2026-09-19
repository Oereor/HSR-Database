<script lang="ts">
  import CompactEntityCard from '$lib/components/shared/CompactEntityCard.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import RarityStars from '$lib/components/shared/RarityStars.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import { getLightConePreviewUrl } from '$lib/data/visual-assets';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerLightConeView } from '$lib/player/equipment';

  export let view: PlayerLightConeView;

  $: equipment = view.equipment;
  $: metadata = view.metadata;
  $: label = equipment
    ? (metadata?.name ?? m.player_equipment_unknown_light_cone({ id: equipment.lightConeId }))
    : m.player_equipment_light_cone_unequipped();
</script>

<div class="player-light-cone" data-player-light-cone={equipment ? equipment.lightConeId : 'empty'}>
  <CompactEntityCard
    href={equipment && metadata
      ? localizedHref(`/light-cones/${equipment.lightConeId}`)
      : undefined}
    imageUrl={equipment && metadata ? getLightConePreviewUrl(equipment.lightConeId) : undefined}
    imageAlt={metadata?.name ?? ''}
    fallbackLabel={label}
  >
    <svelte:fragment slot="title"><GameText text={label} /></svelte:fragment>
    <svelte:fragment slot="secondary">
      {#if metadata?.rarity}<RarityStars rarity={metadata.rarity} size="compact" />{/if}
      {#if metadata?.pathName}<SemanticIconLabel
          kind="path"
          code={metadata.path}
          label={metadata.pathName}
          presentation="path-identity"
        />{/if}
    </svelte:fragment>
    <svelte:fragment slot="tertiary">
      {#if equipment}<span class="player-light-cone__progression">
          <span>{m.player_equipment_level({ level: equipment.level })}</span>
          <span>{m.player_equipment_promotion({ promotion: equipment.promotion })}</span>
          <span>{m.player_equipment_superimposition({ rank: equipment.rank })}</span>
        </span>{/if}
    </svelte:fragment>
  </CompactEntityCard>
</div>

<style>
  .player-light-cone {
    max-width: 42rem;
  }

  .player-light-cone__progression {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
</style>
