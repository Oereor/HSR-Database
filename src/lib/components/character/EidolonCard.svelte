<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
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

<Card.Root
  role="article"
  size="sm"
  class="rank-card flex-row items-start gap-4 px-4"
  data-eidolon-id={eidolon.id}
  data-player-state={playerState}
>
  <AssetImage class="rank-icon" src={iconUrl} alt="" fallbackClass="rank-icon" />
  <div class="rank-card__content">
    <div class="rank-card__meta">
      <Badge variant="outline" class="rank-label text-muted-foreground"
        >{m.eidolon_rank({ rank: eidolon.rank })}</Badge
      >
      {#if playerState}<Badge
          variant="outline"
          class="player-progression-state text-primary"
          data-player-state-label={playerState}
          >{playerState === 'active'
            ? m.player_character_active()
            : m.player_character_inactive()}</Badge
        >{/if}
    </div>
    <h3 class="mt-2 mb-2 text-lg leading-snug font-semibold wrap-anywhere">
      <GameText text={eidolon.name} />
    </h3>
    <p class="text-secondary-foreground m-0 text-base leading-relaxed">
      <GameText text={eidolon.description || m.common_localized_description_unavailable()} />
    </p>
    <SkillExtraEffects effects={eidolon.extraEffects ?? []} />
  </div>
</Card.Root>
