<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { Badge } from '$lib/components/ui/badge';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import TraceEntryContent from './TraceEntryContent.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import { summarizeTraceStats, formatTraceBonus } from '$lib/domain/trace-summary';
  import type { Trace } from '$lib/domain/types';
  import type { PlayerCharacter } from '$lib/player/contract';
  import { createPlayerSkillTreeIndex, resolvePlayerTraceState } from '$lib/player/character';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { m } from '$lib/paraglide/messages.js';

  export let traces: Trace[];
  export let playerSkillTree: PlayerCharacter['skillTree'] | undefined = undefined;
  $: index = playerSkillTree ? createPlayerSkillTreeIndex(playerSkillTree) : undefined;
  $: summary = summarizeTraceStats(
    traces,
    index ? (trace) => resolvePlayerTraceState(trace.id, index!) : undefined
  );
  $: byId = new Map(traces.map((trace) => [trace.id, trace]));
  const prerequisites = (trace: Trace, map: Map<string, Trace>) =>
    trace.prerequisiteIds.flatMap((id) => map.get(id) ?? []);
</script>

<div class="trace-card-panel">
  {#if summary.abilities.length}
    <section class="space-y-4" data-trace-abilities>
      <SectionHeading level={3} headingLevel={3}>{m.trace_extra_ability()}</SectionHeading>
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
              prerequisites={prerequisites(trace, byId)}
              playerState={index ? resolvePlayerTraceState(trace.id, index) : undefined}
            />
          </Card.Content>
        </Card.Root>
      {/each}
    </section>
  {/if}
  {#if summary.summaries.length || summary.independent.length}
    <section class="space-y-4" data-trace-stat-summaries>
      <SectionHeading level={3} headingLevel={3}>{m.trace_stat_bonus()}</SectionHeading>
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
            <output class="text-foreground shrink-0 tabular-nums"
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
            <details>
              <summary class="text-muted-foreground cursor-pointer text-sm"
                >{m.trace_breakdown()}</summary
              >
              <div class="space-y-4 pt-4">
                {#each stat.nodes as node, i (node.trace.id)}
                  {#if i}<Separator />{/if}
                  <div
                    class="trace-card trace-card--stat"
                    data-trace-id={node.trace.id}
                    data-trace-type="stat"
                    data-trace-owner={node.owner?.id}
                    data-trace-standalone={node.owner ? undefined : ''}
                    data-player-state={node.state}
                  >
                    <TraceEntryContent
                      trace={node.trace}
                      owner={node.owner}
                      prerequisites={prerequisites(node.trace, byId)}
                      playerState={node.state}
                    />
                  </div>
                {/each}
              </div>
            </details>
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
              owner={summary.owners.get(trace.id)}
              prerequisites={prerequisites(trace, byId)}
              playerState={index ? resolvePlayerTraceState(trace.id, index) : undefined}
            /></Card.Content
          >
        </Card.Root>
      {/each}
    </section>
  {/if}
</div>
