<script lang="ts">
  import type { Trace } from '$lib/domain/types';
  import type { PlayerProgressionState } from '$lib/player/character';
  import { Badge } from '$lib/components/ui/badge';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import TraceAbilityHeading from './TraceAbilityHeading.svelte';
  import { m } from '$lib/paraglide/messages.js';
  export let trace: Trace;
  export let playerState: PlayerProgressionState | undefined = undefined;
</script>

<div class="space-y-3">
  <TraceAbilityHeading {trace} {playerState} />
  {#if playerState === 'inactive'}<Badge
      variant="outline"
      class="player-progression-state text-muted-foreground"
      data-player-state-label="inactive">{m.player_character_inactive()}</Badge
    >{/if}
  <p class="trace-card__description">
    <GameText text={trace.description || m.common_localized_description_unavailable()} />
  </p>
  <SkillExtraEffects effects={trace.extraEffects ?? []} />
</div>
