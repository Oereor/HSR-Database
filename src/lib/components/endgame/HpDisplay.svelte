<script lang="ts">
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import * as Popover from '$lib/components/ui/popover';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { m } from '$lib/paraglide/messages.js';

  export let hp: EnemyOccurrenceView['hp'];
</script>

<div class="endgame-hp flex min-w-0 items-center justify-end">
  {#if hp.display === 'phases' && hp.phases?.length}
    <Popover.Root>
      <Popover.Trigger
        class="focus-visible:ring-ring hover:text-primary relative z-20 inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-sm text-right outline-none focus-visible:ring-2"
        aria-label={m.endgame_phase_hp_aria()}
        data-endgame-hp-trigger
      >
        <strong class="text-sm leading-relaxed wrap-anywhere tabular-nums" data-endgame-hp
          >{hp.roundedPerBar}</strong
        >
        <ChevronDown class="size-3.5 shrink-0" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content
        side="bottom"
        align="end"
        avoidCollisions={false}
        class="w-max max-w-[calc(100vw-2rem)] min-w-40 p-3"
        aria-label={m.endgame_phase_hp_aria()}
        data-endgame-hp-popover
      >
        <dl class="m-0 grid gap-2 text-sm tabular-nums">
          {#each hp.phases as phase (phase.phase)}
            <div
              class="flex items-center justify-between gap-6"
              data-endgame-hp-phase={phase.phase}
            >
              <dt class="text-muted-foreground">P{phase.phase}</dt>
              <dd class="m-0 font-semibold">{phase.rounded}</dd>
            </div>
          {/each}
        </dl>
      </Popover.Content>
    </Popover.Root>
  {:else}
    <strong
      class="text-foreground text-sm leading-relaxed wrap-anywhere tabular-nums"
      data-endgame-hp
    >
      {hp.display === 'uniform'
        ? (hp.phases?.[0].rounded ?? hp.roundedPerBar)
        : hp.roundedPerBar}{#if hp.display === 'uniform'}<span
          class="endgame-stat__multiplier text-primary"
        >
          &nbsp;× {hp.phases?.length}</span
        >{/if}
    </strong>
  {/if}
</div>
