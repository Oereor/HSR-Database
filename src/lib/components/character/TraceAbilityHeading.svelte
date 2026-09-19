<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Trace } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import type { PlayerProgressionState } from '$lib/player/character';

  export let trace: Trace;
  export let playerState: PlayerProgressionState | undefined = undefined;

  $: iconUrl = getCharacterDetailIconUrl(trace.iconKey);
</script>

{#if iconUrl}
  <div class="trace-card__heading trace-card__heading--icon">
    <div class="trace-card__identity">
      <img src={iconUrl} alt="" aria-hidden="true" />
      <div>
        <h3><GameText text={trace.name} /></h3>
        {#if trace.promotionLimit}<p class="trace-card__condition">
            <span>{m.trace_unlock_condition()}</span>{m.trace_promotion({
              promotion: trace.promotionLimit
            })}
          </p>{/if}
      </div>
    </div>
    <div class="trace-card__tags">
      <span class="skill-effect-tag">{m.trace_extra_ability()}</span>
      {#if playerState === 'unresolved'}<span
          class="player-progression-state"
          data-player-state-label={playerState}>{m.player_character_status_unknown()}</span
        >{/if}
    </div>
  </div>
{:else}
  <div class="trace-card__heading">
    <h3><GameText text={trace.name} /></h3>
    <div class="trace-card__tags">
      <span class="skill-effect-tag">{m.trace_extra_ability()}</span>
      {#if playerState === 'unresolved'}<span
          class="player-progression-state"
          data-player-state-label={playerState}>{m.player_character_status_unknown()}</span
        >{/if}
    </div>
  </div>
  {#if trace.promotionLimit}<p class="trace-card__condition">
      <span>{m.trace_unlock_condition()}</span>{m.trace_promotion({
        promotion: trace.promotionLimit
      })}
    </p>{/if}
{/if}
