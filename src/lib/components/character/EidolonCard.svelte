<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Eidolon } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerEidolonState } from '$lib/player/character';

  export let eidolon: Eidolon;
  export let playerState: PlayerEidolonState | undefined = undefined;

  $: iconUrl = getCharacterDetailIconUrl(eidolon.iconKey);
</script>

<article class="info-card rank-card" data-eidolon-id={eidolon.id} data-player-state={playerState}>
  <AssetImage class="rank-icon" src={iconUrl} alt="" fallbackClass="rank-icon" />
  <div class="rank-card__content">
    <div class="rank-card__meta">
      <small class="rank-label">{m.eidolon_rank({ rank: eidolon.rank })}</small>
      {#if playerState}<span class="player-progression-state" data-player-state-label={playerState}
          >{playerState === 'active'
            ? m.player_character_active()
            : m.player_character_inactive()}</span
        >{/if}
    </div>
    <h3><GameText text={eidolon.name} /></h3>
    <p><GameText text={eidolon.description || m.common_localized_description_unavailable()} /></p>
    <SkillExtraEffects effects={eidolon.extraEffects ?? []} />
  </div>
</article>
