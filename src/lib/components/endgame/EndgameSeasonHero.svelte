<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import GameText from '$lib/components/shared/GameText.svelte';
  import type { EndgamePeriodView } from '$lib/domain/endgame-view';
  import { m } from '$lib/paraglide/messages.js';

  export let period: EndgamePeriodView;
</script>

<section
  class="endgame-season-hero mb-4 min-w-0 min-[821px]:mb-8"
  aria-labelledby="endgame-season-title"
>
  <p
    class="endgame-season-hero__eyebrow text-primary m-0 mb-2 text-xs font-semibold tracking-widest"
  >
    {m.endgame_season_id({ id: period.groupId })}
  </p>
  <h1
    id="endgame-season-title"
    class="text-foreground m-0 mb-2 text-xl leading-tight font-bold tracking-tight wrap-anywhere min-[821px]:text-[length:var(--font-section-title)]"
  >
    <GameText text={period.name} />
  </h1>
  <div
    class="endgame-season-hero__meta text-muted-foreground flex min-w-0 flex-wrap items-center gap-2 text-sm leading-relaxed wrap-anywhere"
  >
    <span>{period.dateLabel}</span>
    {#if period.status === 'current'}
      <Badge variant="outline" class="endgame-inline-status text-primary border-primary/30"
        >{m.endgame_period_current()}</Badge
      >
    {:else if period.status === 'upcoming'}
      <Badge
        variant="outline"
        class="endgame-inline-status endgame-inline-status--upcoming text-[#9fc4ff]"
        >{m.endgame_period_upcoming()}</Badge
      >
    {/if}
  </div>
  <Separator class="mt-4 min-[821px]:mt-6" />
</section>
