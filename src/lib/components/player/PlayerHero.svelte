<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerProfile } from '$lib/player/contract';

  export let profile: PlayerProfile;
  export let avatarUrl: string | null = null;

  const displayCount = (value: number | null) => (value === null ? '-' : String(value));
</script>

<section
  class="player-hero @container/player-profile mb-6 min-w-0"
  aria-labelledby="player-profile-name"
>
  <Card.Root size="sm">
    <Card.Content
      class="player-hero__layout grid min-w-0 items-center gap-4 @min-[48rem]/player-profile:grid-cols-[minmax(0,1fr)_minmax(14rem,0.6fr)]"
    >
      <div
        class="player-hero__identity grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4"
      >
        <div
          class="player-hero__avatar bg-muted border-border grid size-16 place-items-center self-center overflow-hidden rounded-full border sm:size-20"
        >
          <AssetImage
            class="size-full object-cover"
            src={avatarUrl}
            alt={m.player_avatar_alt({ nickname: profile.nickname })}
            fallbackClass="player-hero__avatar-fallback size-full text-2xl"
          />
        </div>

        <div class="player-hero__details flex min-w-0 flex-col justify-center">
          <h2
            id="player-profile-name"
            class="text-foreground m-0 mb-3 text-xl leading-snug font-semibold wrap-anywhere sm:text-2xl"
          >
            {profile.nickname}
          </h2>
          <dl
            class="player-hero__metadata [&_dt]:text-muted-foreground m-0 flex min-w-0 flex-wrap gap-x-4 gap-y-2 [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-sm [&_dd]:font-medium [&_dd]:wrap-anywhere [&_dd]:tabular-nums [&_dt]:text-xs [&>div]:flex [&>div]:min-w-0 [&>div]:flex-wrap [&>div]:items-baseline [&>div]:gap-2"
          >
            <div>
              <dt>{m.player_trailblaze_level()}</dt>
              <dd>{profile.level}</dd>
            </div>
            <div>
              <dt>{m.player_equilibrium_level()}</dt>
              <dd>{profile.worldLevel}</dd>
            </div>
            <div class="player-hero__signature w-full">
              <dt>{m.player_signature()}</dt>
              <dd class="flex-1 whitespace-pre-wrap">{profile.signature || '-'}</dd>
            </div>
            <div>
              <dt>{m.player_uid()}</dt>
              <dd class="player-hero__uid font-mono">{profile.uid}</dd>
            </div>
          </dl>
        </div>
      </div>

      <dl
        class="player-hero__counts [&_dt]:text-muted-foreground [&_dd]:text-primary m-0 grid min-w-0 grid-cols-3 gap-3 [&_dd]:m-0 [&_dd]:mt-1 [&_dd]:text-2xl [&_dd]:leading-tight [&_dd]:font-bold [&_dd]:wrap-anywhere [&_dd]:tabular-nums [&_dt]:text-xs [&_dt]:leading-snug [&_dt]:font-medium [&_dt]:wrap-anywhere [&>div]:min-w-0 [&>div]:text-center"
      >
        <div>
          <dt>{m.player_characters()}</dt>
          <dd>{displayCount(profile.characterCount)}</dd>
        </div>
        <div>
          <dt>{m.player_light_cones()}</dt>
          <dd>{displayCount(profile.lightConeCount)}</dd>
        </div>
        <div>
          <dt>{m.player_achievements()}</dt>
          <dd>{displayCount(profile.achievementCount)}</dd>
        </div>
      </dl>
    </Card.Content>
  </Card.Root>
</section>
