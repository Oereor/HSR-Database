<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import type { EndgameMode } from '$lib/domain/endgame';
  import {
    ENDGAME_MODE_META,
    type EndgamePeriodStatus,
    type EndgamePeriodView
  } from '$lib/domain/endgame-view';
  import EndgameModeIcon from './EndgameModeIcon.svelte';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';

  export let mode: EndgameMode;
  export let period: EndgamePeriodView;
  export let variant: EndgamePeriodStatus;

  $: metadata = ENDGAME_MODE_META[mode];
</script>

<a
  class="endgame-season-card group focus-visible:ring-ring/50 block min-w-0 rounded-lg outline-none focus-visible:ring-3"
  href={localizedHref(`/endgame/${mode}/${period.groupId}`)}
  aria-label={m.endgame_period_detail_aria({ period: period.name })}
  style={`--endgame-accent: ${metadata.accent};`}
  data-endgame-season-card={variant}
>
  <Card.Root
    size="sm"
    class={`group-focus-visible:border-ring relative isolate h-full overflow-hidden transition-colors group-hover:border-[var(--endgame-accent)] ${variant === 'current' ? 'border-[color-mix(in_srgb,var(--endgame-accent)_40%,var(--border))] sm:gap-5 sm:py-5' : ''}`}
  >
    {#if variant === 'current'}
      <span
        class="endgame-season-card__watermark pointer-events-none absolute -right-10 -bottom-16 -z-10 grid -rotate-7 text-[14rem] opacity-[0.065]"
        aria-hidden="true"
      >
        <EndgameModeIcon {mode} />
      </span>
    {/if}
    <Card.Header class="gap-2">
      <Card.Title
        class={variant === 'current'
          ? 'text-2xl sm:text-3xl'
          : variant === 'upcoming'
            ? 'text-xl'
            : 'text-base'}>{period.name}</Card.Title
      >
      <span
        class="endgame-season-card__date text-muted-foreground text-sm wrap-anywhere tabular-nums"
        >{period.dateLabel}</span
      >
    </Card.Header>
    <Card.Content class="mt-auto grid gap-3">
      <Separator />
      <div
        class={`endgame-season-card__footer flex items-center justify-between gap-3 text-sm ${variant === 'current' || variant === 'upcoming' ? 'text-[var(--endgame-accent)]' : 'text-muted-foreground'}`}
      >
        <span>{m.endgame_encounter_count({ count: period.encounterCount })}</span>
        <span
          class="endgame-season-card__arrow shrink-0 text-[var(--endgame-accent)]"
          aria-hidden="true">→</span
        >
      </div>
    </Card.Content>
  </Card.Root>
</a>

<style>
  .endgame-season-card__watermark {
    mask-image: linear-gradient(90deg, transparent 0%, black 42%);
  }
</style>
