<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { Badge } from '$lib/components/ui/badge';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import TraceEntryContent from './TraceEntryContent.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import { summarizeTraceStats, formatTraceBonus } from '$lib/domain/trace-summary';
  import type { Trace } from '$lib/domain/types';
  import type { PlayerCharacter } from '$lib/player/contract';
  import { createPlayerSkillTreeIndex, resolvePlayerTraceState } from '$lib/player/character';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { m } from '$lib/paraglide/messages.js';

  export let traces: Trace[];
  export let characterAccent: string | undefined = undefined;
  export let playerSkillTree: PlayerCharacter['skillTree'] | undefined = undefined;
  $: index = playerSkillTree ? createPlayerSkillTreeIndex(playerSkillTree) : undefined;
  $: summary = summarizeTraceStats(
    traces,
    index ? (trace) => resolvePlayerTraceState(trace.id, index!) : undefined
  );
</script>

<div class="trace-card-panel @container/traces" style:--character-accent={characterAccent}>
  {#if summary.abilities.length}
    <section class="space-y-4" data-trace-abilities>
      {#each summary.abilities as trace (trace.id)}
        <Card.Root
          role="article"
          class="trace-card trace-card--ability gap-0"
          data-trace-id={trace.id}
          data-trace-group={trace.id}
          data-trace-type="ability"
          data-trace-special={trace.sourcePointType === 5 ? '' : undefined}
          data-player-state={index ? resolvePlayerTraceState(trace.id, index) : undefined}
        >
          <Card.Content>
            <TraceEntryContent
              {trace}
              {characterAccent}
              playerState={index ? resolvePlayerTraceState(trace.id, index) : undefined}
            />
          </Card.Content>
        </Card.Root>
      {/each}
    </section>
  {/if}
  {#if summary.summaries.length || summary.independent.length}
    <section
      class="grid grid-cols-1 items-start gap-4 @min-[64rem]/traces:grid-cols-3"
      data-trace-stat-summaries
    >
      {#each summary.summaries as stat (`${stat.propertyType}:${stat.percent}`)}
        <Card.Root
          role="article"
          class="trace-stat-summary character-detail-card"
          data-trace-property={stat.propertyType}
          data-trace-total={stat.value}
        >
          <Card.Header class="flex flex-row items-center justify-between gap-4">
            <Card.Title class="flex min-w-0 items-center gap-3 text-lg">
              <AssetImage
                src={getCharacterDetailIconUrl(stat.nodes[0].trace.iconKey)}
                alt=""
                class="size-8 shrink-0 object-contain"
                fallbackClass="size-8 shrink-0"
              />
              <span><GameText text={stat.nodes[0].trace.name} /></span>
            </Card.Title>
            <output class="shrink-0 font-semibold tabular-nums" style:color={characterAccent}
              >{stat.value > 0 ? '+' : ''}{formatTraceBonus(
                stat.value,
                stat.percent,
                getLocale()
              )}</output
            >
          </Card.Header>
          <Separator />
          <Card.Content>
            {#if stat.unresolved}<Badge variant="outline" data-player-state-label="unresolved"
                >{m.player_character_status_unknown()}</Badge
              >{/if}
            <Collapsible.Root>
              <Collapsible.Trigger
                class="text-muted-foreground group focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2 rounded-sm text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <ChevronDown class="size-4 shrink-0 group-data-[state=open]:rotate-180" />
                {m.trace_breakdown()}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <div class="divide-border divide-y pt-2">
                  {#each stat.nodes as node (node.trace.id)}
                    <div
                      class="flex items-baseline justify-between gap-2 py-2 text-sm"
                      data-trace-id={node.trace.id}
                      data-trace-type="stat"
                      data-trace-owner={node.owner?.id}
                      data-trace-standalone={node.owner ? undefined : ''}
                      data-player-state={node.state}
                    >
                      <span
                        class="shrink-0 font-semibold tabular-nums"
                        style:color={characterAccent}
                      >
                        {node.trace.statBonus!.value > 0 ? '+' : ''}{formatTraceBonus(
                          node.trace.statBonus!.value,
                          stat.percent,
                          getLocale()
                        )}
                      </span>
                      {#if node.trace.promotionLimit}
                        <span class="text-right whitespace-nowrap">
                          <span class="text-muted-foreground">{m.trace_unlock_condition()}</span>
                          <span class="text-[var(--gold-soft)]"
                            >{m.trace_promotion({ promotion: node.trace.promotionLimit })}</span
                          >
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          </Card.Content>
        </Card.Root>
      {/each}
      {#each summary.independent as trace (trace.id)}
        <Card.Root
          role="article"
          class="trace-card trace-card--stat"
          data-trace-id={trace.id}
          data-trace-type="stat"
          data-player-state={index ? resolvePlayerTraceState(trace.id, index) : undefined}
        >
          <Card.Content
            ><TraceEntryContent
              {trace}
              {characterAccent}
              playerState={index ? resolvePlayerTraceState(trace.id, index) : undefined}
            /></Card.Content
          >
        </Card.Root>
      {/each}
    </section>
  {/if}
</div>
