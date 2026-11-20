<script lang="ts">
  import type { EnemyCatalogEntry, EnemyVariantIdentity } from '$lib/domain/types';
  import { getEnemyRankLabel } from '$lib/domain/enemy-overview';
  import EnemyWeaknessGroup from './EnemyWeaknessGroup.svelte';
  import EntityOverviewCard from '../shared/EntityOverviewCard.svelte';
  import { enemyDetailHref } from '$lib/domain/enemy-view';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import GameText from '../shared/GameText.svelte';

  export let entry: EnemyCatalogEntry;
  export let variant: EnemyVariantIdentity | undefined = undefined;
  export let imageUrl: string | undefined = undefined;
</script>

<EntityOverviewCard
  href={localizedHref(enemyDetailHref(entry.id, variant?.monsterId))}
  {imageUrl}
  density="compact"
  imageAlt=""
  artworkAspect="landscape"
>
  <svelte:fragment slot="overlay">{getEnemyRankLabel(entry.type)}</svelte:fragment>
  <svelte:fragment slot="title"><GameText text={entry.name} /></svelte:fragment>
  <svelte:fragment slot="metadata">
    {#if variant}
      <span
        class="text-muted-foreground text-xs wrap-anywhere"
        data-matched-monster={variant.monsterId}
      >
        <GameText text={variant.name} /> · #{variant.monsterId}
      </span>
    {/if}
    {#if variant && variant.monsterId !== entry.representative.monsterId && entry.representative.weaknesses.length}
      <span class="text-muted-foreground text-xs">{m.enemy_default_weaknesses()}</span>
    {/if}
    <EnemyWeaknessGroup weaknesses={entry.representative.weaknesses} size="overview" />
  </svelte:fragment>
</EntityOverviewCard>
