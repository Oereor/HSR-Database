<script lang="ts">
  import { cn } from '$lib/utils.js';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import RelicIcon from '$lib/components/relic/RelicIcon.svelte';
  import { getRelicPieceIconUrl } from '$lib/data/visual-assets';
  import { getRarityColor } from '$lib/domain/rarity';
  import { relicSlotLabel } from '$lib/i18n/product';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerRelicSlotView } from '$lib/player/equipment';
  import type { PlayerRelicPieceScoreV2 } from '$lib/player/relic-rating-v2-contract';
  import { formatRelicScore } from '$lib/player/relic-score-presentation';
  import PlayerAffixRow from './PlayerAffixRow.svelte';

  export let view: PlayerRelicSlotView;
  export let score: PlayerRelicPieceScoreV2 | undefined = undefined;
  export let showScore = false;

  $: unresolvedLabel = view.relic
    ? m.player_equipment_unknown_relic({ setId: view.relic.setId, type: view.type })
    : m.player_equipment_unequipped();
  $: href = view.set ? localizedHref(`/relics/${view.set.id}`) : undefined;
  $: elementProps = href ? { href } : {};
</script>

<svelte:element
  this={href ? 'a' : 'article'}
  {...elementProps}
  class="group/relic text-foreground focus-visible:ring-ring/50 block min-w-0 rounded-lg no-underline outline-none focus-visible:ring-3"
  data-player-relic-slot={view.slot}
  data-player-relic-state={view.relic ? (view.set && view.piece ? 'known' : 'unknown') : 'empty'}
>
  <Card.Root
    size="sm"
    class={cn(
      'h-full gap-0 overflow-hidden py-3 transition-colors',
      href && 'group-hover/relic:border-primary/40'
    )}
  >
    <Card.Header class="grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2">
      <div class="size-16">
        <RelicIcon
          source={view.piece ? getRelicPieceIconUrl(view.piece.id) : undefined}
          alt={view.piece?.name ?? ''}
          presentation="header"
        />
      </div>
      <div class="grid min-w-0 gap-1">
        <span class="text-muted-foreground text-xs">{relicSlotLabel(view.slot)}</span>
        <Card.Title class="text-sm leading-snug font-semibold wrap-anywhere"
          >{view.relic
            ? (view.set?.name ?? unresolvedLabel)
            : m.player_equipment_unequipped()}</Card.Title
        >
        {#if view.relic}
          <p class="text-muted-foreground m-0 text-xs wrap-anywhere">
            {view.piece?.name ?? unresolvedLabel}
          </p>
        {/if}
      </div>
      <div class="flex flex-col items-end gap-1 self-start">
        {#if view.relic}
          <strong
            class="shrink-0 text-sm tabular-nums"
            data-player-relic-level
            style:color={getRarityColor(view.relic.rarity) ?? 'var(--gold)'}
            >+{view.relic.level}</strong
          >
        {/if}
        {#if view.relic && showScore}
          <Badge
            variant="secondary"
            data-player-relic-piece-score
            aria-label={m.player_relic_score_piece_value({
              value:
                score?.status === 'available'
                  ? formatRelicScore(score.score)
                  : m.player_relic_score_unavailable()
            })}
          >
            {m.player_relic_score_piece()}
            <strong class="tabular-nums"
              >{score?.status === 'available' ? formatRelicScore(score.score) : '—'}</strong
            >
          </Badge>
        {/if}
      </div>
    </Card.Header>
    {#if view.relic}
      <Separator class="mt-2" />
      <Card.Content class="py-2" data-player-relic-affixes="main">
        {#if view.mainAffix}
          <PlayerAffixRow affix={view.mainAffix} presentation="main" />
        {:else}
          <p
            class="text-muted-foreground m-0 px-2 py-1.5 text-xs"
            data-player-relic-main-unavailable
          >
            — {m.player_equipment_main_affix_unknown()}
          </p>
        {/if}
      </Card.Content>
      <Separator />
      <Card.Content class="grid pt-2" data-player-relic-affixes="sub">
        {#if view.subAffixes.length}
          {#each view.subAffixes as affix, index (`${affix.type}:${index}`)}
            <PlayerAffixRow {affix} />
          {/each}
        {:else}
          <p class="text-muted-foreground m-0 px-2 py-1.5 text-xs">—</p>
        {/if}
      </Card.Content>
    {/if}
  </Card.Root>
</svelte:element>
