<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Eidolon, ExEidolon, DescriptionToken } from '$lib/domain/types';
  import type { PlayerEidolonState } from '$lib/player/character';
  import { m } from '$lib/paraglide/messages.js';
  export let characterAccent: string | undefined = undefined;
  export let eidolon: Eidolon | ExEidolon;
  export let playerState: PlayerEidolonState | undefined = undefined;
  export let playerStateSource: 'player' | 'missing' | undefined = undefined;
  export let onOpenSeriesEffects:
    | ((
        trigger: HTMLButtonElement,
        reference: NonNullable<DescriptionToken['interaction']>
      ) => void)
    | undefined = undefined;
</script>

<Card.Root
  role="article"
  class="rank-card character-detail-card"
  data-eidolon-id={eidolon.id}
  data-player-state={playerState}
  data-player-state-source={playerStateSource}
  data-eidolon-kind={'rank' in eidolon ? 'rank' : 'ex-rank'}
>
  <Card.Header class="flex flex-row items-center gap-3">
    <AssetImage
      class="rank-icon"
      src={getCharacterDetailIconUrl(eidolon.iconKey)}
      alt=""
      fallbackClass="rank-icon"
    />
    <div class="rank-card__content min-w-0 flex-1 space-y-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          class="rank-label text-muted-foreground"
          style={'rank' in eidolon ? undefined : `color: ${characterAccent}`}
          >{'rank' in eidolon ? m.eidolon_rank({ rank: eidolon.rank }) : eidolon.badgeLabel}</Badge
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
      <Card.Title><GameText text={eidolon.name} /></Card.Title>
    </div>
  </Card.Header>
  <Separator />
  <Card.Content class="space-y-3">
    <p class="text-secondary-foreground m-0 text-base leading-relaxed">
      {#if eidolon.descriptionTokens?.length}
        <DescriptionText
          tokens={eidolon.descriptionTokens}
          {characterAccent}
          {onOpenSeriesEffects}
        />
      {:else}<GameText
          text={eidolon.description || m.common_localized_description_unavailable()}
        />{/if}
    </p>
    <SkillExtraEffects effects={eidolon.extraEffects ?? []} {characterAccent} />
  </Card.Content>
</Card.Root>
