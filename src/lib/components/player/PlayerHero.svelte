<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerProfile } from '$lib/player/contract';

  export let profile: PlayerProfile;
  export let avatarUrl: string | null = null;

  let failedAvatarUrl: string | null = null;
  $: showAvatar = avatarUrl !== null && failedAvatarUrl !== avatarUrl;
  const displayCount = (value: number | null) => (value === null ? '-' : String(value));
</script>

<section class="player-hero" aria-labelledby="player-profile-name">
  <div class="player-hero__identity">
    <div class="player-hero__avatar">
      {#if showAvatar}
        <img
          src={avatarUrl ?? ''}
          alt={m.player_avatar_alt({ nickname: profile.nickname })}
          on:error={() => (failedAvatarUrl = avatarUrl)}
        />
      {:else}
        <span role="img" aria-label={m.player_avatar_unavailable()}>?</span>
      {/if}
    </div>

    <div class="player-hero__details">
      <h2 id="player-profile-name">{profile.nickname}</h2>
      <dl class="player-hero__metadata">
        <div>
          <dt>{m.player_trailblaze_level()}</dt>
          <dd>{profile.level}</dd>
        </div>
        <div>
          <dt>{m.player_equilibrium_level()}</dt>
          <dd>{profile.worldLevel}</dd>
        </div>
        <div class="player-hero__signature">
          <dt>{m.player_signature()}</dt>
          <dd>{profile.signature || '-'}</dd>
        </div>
        <div>
          <dt>{m.player_uid()}</dt>
          <dd class="player-hero__uid">{profile.uid}</dd>
        </div>
      </dl>
    </div>
  </div>

  <dl class="player-hero__counts">
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
</section>

<style>
  .player-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 34%);
    align-items: center;
    gap: var(--space-8);
    margin-bottom: var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: linear-gradient(135deg, rgb(215 181 109 / 8%), transparent 42%), var(--surface-2);
    padding: var(--space-6);
  }

  .player-hero__identity {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: stretch;
    gap: var(--space-6);
    min-width: 0;
  }

  .player-hero__details {
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
  }

  .player-hero__avatar {
    display: grid;
    align-self: center;
    width: 112px;
    height: 112px;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--faint);
    font-size: 2rem;
  }

  .player-hero__avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  h2 {
    margin: 0 0 var(--space-3);
    overflow-wrap: anywhere;
    font-size: clamp(1.45rem, 3vw, 2rem);
  }

  dl,
  dt,
  dd {
    margin: 0;
  }

  .player-hero__metadata {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
  }

  .player-hero__metadata > div {
    display: flex;
    gap: var(--space-2);
  }

  dt {
    color: var(--muted);
    font-size: var(--font-internal);
  }

  dd {
    color: var(--text);
    font-weight: 700;
  }

  .player-hero__signature {
    width: 100%;
  }

  .player-hero__signature dd {
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .player-hero__uid {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .player-hero__counts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .player-hero__counts > div {
    min-width: 0;
    text-align: center;
  }

  .player-hero__counts dt {
    min-height: 2.7em;
  }

  .player-hero__counts dd {
    margin-top: var(--space-1);
    color: var(--gold-soft);
    font-size: clamp(1.9rem, 4vw, 2.55rem);
    font-weight: 800;
    line-height: 1;
  }

  @media (max-width: 820px) {
    .player-hero {
      grid-template-columns: 1fr;
      gap: var(--space-6);
    }
  }

  @media (max-width: 520px) {
    .player-hero {
      padding: var(--space-4);
    }

    .player-hero__identity {
      grid-template-columns: 76px minmax(0, 1fr);
      gap: var(--space-4);
    }

    .player-hero__avatar {
      width: 76px;
      height: 76px;
    }

    .player-hero__counts {
      gap: var(--space-2);
    }

    .player-hero__counts dt {
      font-size: 0.68rem;
    }
  }
</style>
