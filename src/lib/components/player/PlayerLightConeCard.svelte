<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import RarityStars from '$lib/components/shared/RarityStars.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import StatList from '$lib/components/shared/StatList.svelte';
  import StatRow from '$lib/components/shared/StatRow.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { getCharacterDetailIconUrl, getLightConePortraitUrl } from '$lib/data/visual-assets';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import type { SearchLocale } from '$lib/domain/search-index';
  import { formatBaseStat } from '$lib/domain/stats';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import {
    resolvePlayerLightConeDetails,
    type PlayerLightConeDetails,
    type PlayerLightConeView
  } from '$lib/player/equipment';

  export let view: PlayerLightConeView;
  export let locale: SearchLocale;
  export let characterPath: string | undefined = undefined;
  export let details: Promise<PlayerLightConeDetails> | undefined = undefined;

  $: ({ equipment, metadata } = view);
  $: label = equipment
    ? (metadata?.name ??
      m.player_equipment_unknown_light_cone({ id: equipment.lightConeId }, { locale }))
    : m.player_equipment_light_cone_unequipped({}, { locale });
  $: detailHref =
    equipment && metadata
      ? localizedHref(
          `/light-cones/${equipment.lightConeId}/?level=${equipment.level}&rank=${equipment.rank}`,
          locale
        )
      : undefined;

  const stats = [
    ['hp', m.common_hp],
    ['attack', m.common_attack],
    ['defence', m.common_defence]
  ] as const;
</script>

{#snippet rankBadge(rank: number)}
  <Badge data-player-light-cone-rank={rank}>
    {m.player_equipment_superimposition({ rank }, { locale })}
  </Badge>
{/snippet}

{#snippet identity()}
  <div class="flex min-w-0 items-center gap-3 self-center" data-player-light-cone-identity>
    {#if metadata?.pathName}
      <div
        class="flex shrink-0 [--semantic-icon-image-size:2.5rem] @min-[35rem]:[--semantic-icon-image-size:3.25rem]"
      >
        <SemanticIconLabel
          kind="path"
          code={metadata.path}
          label={metadata.pathName}
          showLabel={false}
        />
      </div>
    {/if}
    <div class="grid min-w-0 gap-1">
      <h3
        class="m-0 min-w-0 text-lg leading-tight font-semibold wrap-anywhere @min-[35rem]:text-2xl"
      >
        <GameText text={label} />
      </h3>
      {#if equipment}
        <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          {#if metadata?.rarity}<RarityStars rarity={metadata.rarity} />{/if}
          <span
            class="font-bold whitespace-nowrap text-(--gold-soft) tabular-nums"
            data-player-light-cone-level={equipment.level}>Lv.{equipment.level}</span
          >
          <Badge
            variant="outline"
            class="skill-effect-tag text-primary"
            data-player-light-cone-promotion={equipment.promotion}
          >
            {m.player_equipment_promotion({ promotion: equipment.promotion }, { locale })}
          </Badge>
          {#if !metadata}{@render rankBadge(equipment.rank)}{/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet coneDetails(data: PlayerLightConeDetails | undefined, rank: number, loading = false)}
  {@const resolved = resolvePlayerLightConeDetails(view, characterPath, data)}
  {@const values = resolved?.stats}
  <div
    class="contents @min-[35rem]:grid @min-[35rem]:min-w-0 @min-[35rem]:content-start @min-[35rem]:gap-5 @min-[52rem]:gap-6"
  >
    <div
      class="contents @min-[35rem]:grid @min-[35rem]:min-w-0 @min-[35rem]:items-center @min-[35rem]:gap-4 @min-[52rem]:grid-cols-[fit-content(min(26rem,52%))_minmax(0,1fr)] @min-[52rem]:gap-x-6 @min-[70rem]:gap-x-8"
    >
      {@render identity()}
      {#if values}
        <StatList
          spacing="flush"
          hasIcons={stats.some(
            ([key]) => !!getCharacterDetailIconUrl(data?.baseStats.iconKeys?.[key])
          )}
          class="col-span-full grid grid-cols-[repeat(auto-fit,minmax(min(100%,4.75rem),1fr))] gap-x-3 gap-y-2 @min-[35rem]:col-auto @min-[52rem]:grid-cols-[repeat(3,minmax(0,8.5rem))] [&_.inspection-stat-label]:gap-1 [&_dd]:text-left [&_dt_[data-slot=separator]]:hidden [&>div]:min-h-0 [&>div]:grid-cols-1 [&>div]:gap-1 [&>div]:py-0"
          data-player-light-cone-stats
        >
          {#each stats as [key, statLabel] (key)}
            <StatRow
              data-base-stat={key}
              label={statLabel({}, { locale })}
              value={formatBaseStat(values[key])}
              iconUrl={getCharacterDetailIconUrl(data?.baseStats.iconKeys?.[key])}
              tone="scaling"
            />
          {/each}
        </StatList>
      {:else if !loading}
        <p class="data-placeholder col-span-full self-center @min-[35rem]:col-auto">
          {m.base_stats_empty({}, { locale })}
        </p>
      {/if}
    </div>

    <div
      class="col-span-full grid min-w-0 content-start gap-2.5 @min-[35rem]:col-auto"
      data-player-light-cone-effect
      data-details-state={loading ? 'loading' : data ? 'ready' : 'unavailable'}
    >
      <Separator class="mb-1.5" />
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        {#if resolved?.effectName}
          <h4 class="m-0 min-w-0 text-lg font-semibold wrap-anywhere">
            <GameText text={resolved.effectName} />
          </h4>
        {/if}
        {@render rankBadge(rank)}
        {#if resolved?.pathMismatchWarning}
          <Badge
            variant="outline"
            class="border-primary/40 bg-primary/10 text-primary max-w-full min-w-0 items-start"
            data-player-light-cone-warning
          >
            <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 wrap-anywhere"
              ><GameText text={resolved.pathMismatchWarning} /></span
            >
          </Badge>
        {/if}
      </div>
      {#if loading}
        <p class="data-placeholder" aria-live="polite">
          {m.player_equipment_loading({}, { locale })}
        </p>
      {:else if resolved?.effectTokens?.length}
        <p
          class="levelled-description m-0 min-w-0 wrap-anywhere [&_.description-token--unbreak]:whitespace-normal [&_.game-text__unbreak]:whitespace-normal"
        >
          <DescriptionText tokens={resolved.effectTokens} />
        </p>
      {:else}
        <p class="data-placeholder">{m.superimposition_description_unavailable({}, { locale })}</p>
      {/if}
    </div>
  </div>
{/snippet}

<div
  class="player-light-cone @container min-w-0"
  data-player-light-cone={equipment?.lightConeId ?? 'empty'}
>
  <svelte:element
    this={detailHref ? 'a' : 'article'}
    href={detailHref}
    aria-label={detailHref ? gameTextToPlain(label) : undefined}
    class="group/light-cone focus-visible:outline-ring block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-3"
  >
    <Card.Root
      class={[
        'grid min-w-0 grid-cols-1 items-start gap-4 p-4 @min-[17rem]:grid-cols-[4.5rem_minmax(0,1fr)] @min-[35rem]:grid-cols-[8rem_minmax(0,1fr)] @min-[35rem]:gap-5 @min-[35rem]:p-5 @min-[52rem]:grid-cols-[10rem_minmax(0,1fr)] @min-[52rem]:gap-6 @min-[52rem]:p-6',
        !!detailHref &&
          'group-hover/light-cone:border-muted-foreground group-hover/light-cone:bg-accent/25 motion-safe:transition-colors'
      ]}
    >
      <div
        class={[
          'grid aspect-[3/5] w-full max-w-24 place-items-center',
          !!metadata && '@min-[35rem]:max-w-none'
        ]}
        aria-hidden="true"
        data-player-light-cone-artwork
      >
        <AssetImage
          src={metadata ? getLightConePortraitUrl(metadata.id) : undefined}
          class="size-full min-h-0 min-w-0 object-contain"
          fallbackClass="text-3xl"
          loading="lazy"
          decoding="async"
        />
      </div>

      {#if equipment && metadata}
        {#await details}
          {@render coneDetails(undefined, equipment.rank, true)}
        {:then data}
          {@render coneDetails(data, equipment.rank)}
        {:catch}
          {@render coneDetails(undefined, equipment.rank)}
        {/await}
      {:else}
        {@render identity()}
      {/if}
    </Card.Root>
  </svelte:element>
</div>
