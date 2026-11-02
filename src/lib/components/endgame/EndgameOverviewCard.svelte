<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import type { EndgameModeView } from '$lib/domain/endgame-view';
  import { ENDGAME_MODE_META } from '$lib/domain/endgame-view';
  import EndgameModeIcon from './EndgameModeIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { localizedHref } from '$lib/i18n/routing';

  export let mode: EndgameModeView;
  export let featured = false;

  $: metadata = ENDGAME_MODE_META[mode.mode];
  $: period = mode.periods.find((candidate) => candidate.groupId === mode.recommendedGroupId);
  $: dateLabel = period?.dateLabel ?? '-';
  $: href = localizedHref(
    period ? `/endgame/${mode.mode}/${period.groupId}` : `/endgame/${mode.mode}`
  );
</script>

<a
  class="endgame-overview-card group focus-visible:ring-ring/50 block min-w-0 rounded-xl outline-none focus-visible:ring-3"
  {href}
  style={`--endgame-accent: ${metadata.accent};`}
  data-endgame-overview-card={mode.mode}
>
  <Card.Root
    size="sm"
    class="group-focus-visible:border-ring relative isolate h-full overflow-hidden transition-colors group-hover:border-[var(--endgame-accent)]"
  >
    <span
      class={`endgame-overview-card__watermark pointer-events-none absolute -z-10 grid -rotate-7 opacity-[0.07] ${featured ? 'right-[2%] -bottom-20 text-[17rem]' : '-right-10 -bottom-12 text-[12rem]'}`}
      aria-hidden="true"
    >
      <EndgameModeIcon mode={mode.mode} />
    </span>
    <Card.Header class="flex items-center gap-3">
      <span class="grid shrink-0 text-4xl"><EndgameModeIcon mode={mode.mode} /></span>
      <h2 class="m-0 min-w-0 text-lg leading-snug font-semibold wrap-anywhere">{mode.label}</h2>
    </Card.Header>
    <Card.Content class="endgame-overview-card__season flex flex-1 flex-col gap-2">
      <span class="text-xs font-medium text-[var(--endgame-accent)]"
        >{m.endgame_current_period()}</span
      >
      <strong class="text-xl leading-snug font-semibold wrap-anywhere"
        >{period?.name ?? m.endgame_no_period()}</strong
      >
      <span class="text-muted-foreground text-sm wrap-anywhere tabular-nums">{dateLabel}</span>
    </Card.Content>
    <Card.Content class="mt-auto grid gap-3">
      <Separator />
      <div class="flex items-center justify-between gap-3 text-sm text-[var(--endgame-accent)]">
        <span>{m.endgame_period_count({ count: mode.periods.length })}</span>
        <span class="shrink-0" aria-hidden="true">→</span>
      </div>
    </Card.Content>
  </Card.Root>
</a>

<style>
  .endgame-overview-card__watermark {
    mask-image: linear-gradient(90deg, transparent 0%, black 38%);
  }
</style>
