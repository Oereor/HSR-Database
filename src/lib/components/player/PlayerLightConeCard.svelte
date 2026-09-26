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
  $: detailHref =
    equipment && metadata
      ? localizedHref(
          `/light-cones/${equipment.lightConeId}/?level=${equipment.level}&rank=${equipment.rank}`
        )
      : undefined;
</script>

<div class="player-light-cone" data-player-light-cone={equipment ? equipment.lightConeId : 'empty'}>
  <CompactEntityCard
    href={detailHref}
    imageUrl={equipment && metadata ? getLightConePreviewUrl(equipment.lightConeId) : undefined}
    imageAlt={metadata?.name ?? ''}
  >
    <svelte:fragment slot="title"><GameText text={label} /></svelte:fragment>
    <svelte:fragment slot="secondary">
      <span class="player-light-cone__identity">
        {#if metadata?.rarity}<span><RarityStars rarity={metadata.rarity} size="compact" /></span
          >{/if}
        {#if metadata?.pathName}<span
            ><SemanticIconLabel
              kind="path"
              code={metadata.path}
              label={metadata.pathName}
              presentation="path-identity"
            /></span
          >{/if}
      </span>
    </svelte:fragment>
    <svelte:fragment slot="aside">
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
    display: grid;
    gap: 0.28rem;
  }

  .player-light-cone__progression > span {
    white-space: nowrap;
  }

  .player-light-cone__identity {
    display: grid;
    align-items: start;
    gap: 0.28rem;
  }

  .player-light-cone__identity > span {
    display: flex;
    min-width: 0;
  }

  @media (max-width: 520px) {
    .player-light-cone__progression {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-4);
    }
  }
</style>
