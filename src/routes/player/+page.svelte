<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import CharacterOverviewCard from '$lib/components/character/CharacterOverviewCard.svelte';
  import PlayerHero from '$lib/components/player/PlayerHero.svelte';
  import PlayerUidForm from '$lib/components/player/PlayerUidForm.svelte';
  import UnknownPlayerCharacterCard from '$lib/components/player/UnknownPlayerCharacterCard.svelte';
  import OverviewGrid from '$lib/components/shared/OverviewGrid.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { getCharacterPreviewUrl } from '$lib/data/visual-assets';
  import { m } from '$lib/paraglide/messages.js';
  import { PlayerApiError, fetchPlayerProfile, normalizePlayerUid } from '$lib/player/client';
  import type { PlayerProfile } from '$lib/player/contract';
  import {
    createCharacterCatalogIndex,
    playerCharacterHref,
    playerPageHref,
    readPlayerUidQuery,
    resolvePlayerAvatar,
    resolvePlayerCharacter,
    type PlayerUidQueryState
  } from '$lib/player/resolve';
  import { formatDocumentTitle } from '$lib/site';
  import { onMount } from 'svelte';

  export let data;

  type ViewState = 'idle' | 'loading' | 'success' | 'error';

  let clientReady = false;
  let handledSearch: string | null = null;
  let requestVersion = 0;
  let state: ViewState = 'idle';
  let profile: PlayerProfile | null = null;
  let requestError: PlayerApiError | null = null;
  let localError: string | null = null;
  let draftUid = '';
  let queryState: PlayerUidQueryState = { kind: 'idle', input: '' };

  const characterCatalog = createCharacterCatalogIndex(data.characters);

  onMount(() => (clientReady = true));

  $: queryState = clientReady
    ? readPlayerUidQuery(new URLSearchParams($page.url.searchParams))
    : { kind: 'idle', input: '' };
  $: if (clientReady) synchronizeQuery($page.url.search, queryState);
  $: avatarUrl = resolvePlayerAvatar(profile?.avatar?.id);
  $: visibleCharacters =
    profile?.characters.map((character) => ({
      character,
      entry: resolvePlayerCharacter(character.characterId, characterCatalog)
    })) ?? [];
  $: requestErrorMessage = requestError ? playerErrorMessage(requestError) : null;
  $: formErrorMessage = localError ?? requestErrorMessage;

  function playerErrorMessage(error: PlayerApiError): string {
    switch (error.code) {
      case 'INVALID_UID':
        return m.player_error_invalid_uid();
      case 'PLAYER_NOT_FOUND':
        return m.player_error_not_found();
      case 'RATE_LIMITED':
        return error.retryAfterSeconds === undefined
          ? m.player_error_rate_limited()
          : m.player_error_rate_limited_retry({ seconds: error.retryAfterSeconds });
      case 'UPSTREAM_TIMEOUT':
        return m.player_error_timeout();
      case 'UPSTREAM_UNAVAILABLE':
        return m.player_error_unavailable();
      case 'UPSTREAM_INVALID_RESPONSE':
        return m.player_error_invalid_response();
    }
  }

  function synchronizeQuery(search: string, next: PlayerUidQueryState): void {
    if (handledSearch === search) return;
    handledSearch = search;
    requestVersion += 1;
    const version = requestVersion;
    draftUid = next.kind === 'valid' ? next.uid : next.input;
    localError = null;
    profile = null;
    requestError = null;

    if (next.kind === 'idle') {
      state = 'idle';
      return;
    }
    if (next.kind === 'invalid') {
      state = 'error';
      requestError = new PlayerApiError('INVALID_UID', false);
      return;
    }

    state = 'loading';
    void fetchPlayerProfile(next.uid)
      .then((result) => {
        if (requestVersion !== version) return;
        profile = result;
        state = 'success';
      })
      .catch((error: unknown) => {
        if (requestVersion !== version) return;
        requestError =
          error instanceof PlayerApiError
            ? error
            : new PlayerApiError('UPSTREAM_UNAVAILABLE', true);
        state = 'error';
      });
  }

  async function submitUid(value: string): Promise<void> {
    const uid = normalizePlayerUid(value);
    if (!uid) {
      localError = m.player_error_invalid_uid();
      return;
    }

    localError = null;
    const href = playerPageHref(uid);
    const currentHref = `${$page.url.pathname}${$page.url.search}`;
    if (currentHref === href) {
      handledSearch = null;
      synchronizeQuery($page.url.search, readPlayerUidQuery($page.url.searchParams));
      return;
    }
    await goto(href, { keepFocus: true, noScroll: true });
  }

  function retryCurrent(): void {
    if (queryState.kind !== 'valid') return;
    handledSearch = null;
    synchronizeQuery($page.url.search, queryState);
  }
</script>

<svelte:head>
  <title>{formatDocumentTitle(m.player_title())}</title>
  <meta name="description" content={m.player_meta_description()} />
</svelte:head>

<header class="player-page__heading">
  <p class="kicker">{m.player_eyebrow()}</p>
  <h1>{m.player_title()}</h1>
  <p>{m.player_description()}</p>
</header>

<PlayerUidForm
  bind:value={draftUid}
  busy={state === 'loading'}
  errorMessage={formErrorMessage}
  onSubmit={submitUid}
  onInput={() => (localError = null)}
/>

{#if state === 'idle'}
  <section class="player-query-state" aria-live="polite">
    <p>{m.player_idle()}</p>
  </section>
{:else if state === 'loading'}
  <section class="player-query-state" role="status" aria-live="polite">
    <span class="player-query-state__indicator" aria-hidden="true"></span>
    <p>{m.player_loading()}</p>
  </section>
{:else if state === 'error'}
  <section class="player-query-state player-query-state--error" aria-live="assertive">
    <p>{requestErrorMessage}</p>
    {#if queryState.kind === 'valid'}
      <button class="button button--quiet" type="button" on:click={retryCurrent}
        >{m.player_retry()}</button
      >
    {/if}
  </section>
{:else if profile}
  <PlayerHero {profile} {avatarUrl} />

  <section class="player-characters" aria-labelledby="player-public-characters">
    <SectionHeading level={1} id="player-public-characters">
      {m.player_public_characters()}
    </SectionHeading>

    {#if visibleCharacters.length}
      <OverviewGrid variant="character">
        {#each visibleCharacters as item, index (`${item.character.characterId}-${index}`)}
          {#if item.entry}
            <CharacterOverviewCard
              entry={item.entry}
              href={playerCharacterHref(item.character.characterId, profile.uid)}
              imageUrl={getCharacterPreviewUrl(item.character.characterId)}
              density="compact"
            />
          {:else}
            <UnknownPlayerCharacterCard characterId={item.character.characterId} />
          {/if}
        {/each}
      </OverviewGrid>
    {:else}
      <div class="player-characters__empty">
        <h3>{m.player_public_characters_empty_title()}</h3>
        <p>{m.player_public_characters_empty_description()}</p>
      </div>
    {/if}
  </section>
{/if}

<style>
  .player-page__heading {
    max-width: 760px;
    margin-bottom: var(--space-8);
  }

  .player-page__heading h1 {
    margin: 0 0 var(--space-3);
    font-size: clamp(2rem, 5vw, 3.4rem);
  }

  .player-page__heading > p:last-child {
    margin: 0;
    color: var(--text-secondary);
  }

  .player-query-state {
    display: flex;
    min-height: 120px;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    text-align: center;
  }

  .player-query-state p {
    margin: 0;
  }

  .player-query-state--error {
    flex-direction: column;
    border-color: rgb(239 137 137 / 36%);
  }

  .player-query-state__indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--gold);
    box-shadow: 0 0 0 6px rgb(215 181 109 / 12%);
  }

  .player-characters {
    margin-top: var(--space-8);
  }

  .player-characters__empty {
    margin-top: var(--space-4);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-8);
    text-align: center;
  }

  .player-characters__empty h3,
  .player-characters__empty p {
    margin: 0;
  }

  .player-characters__empty p {
    margin-top: var(--space-2);
    color: var(--muted);
  }
</style>
