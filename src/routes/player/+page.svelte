<script lang="ts">
  import * as Empty from '$lib/components/ui/empty';
  import * as Alert from '$lib/components/ui/alert';
  import { Spinner } from '$lib/components/ui/spinner';
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

  const characterCatalog = createCharacterCatalogIndex(data.characters);

  onMount(() => (clientReady = true));

  $: if (clientReady)
    synchronizeQuery(
      $page.url.search,
      readPlayerUidQuery(new URLSearchParams($page.url.searchParams))
    );
  $: avatarUrl = resolvePlayerAvatar(profile?.avatar?.id);
  $: visibleCharacters =
    profile?.characters.map((character) => ({
      character,
      entry: resolvePlayerCharacter(character.characterId, characterCatalog)
    })) ?? [];
  $: supportCharacters = visibleCharacters.filter(
    ({ character }) => character.display.area === 'assist'
  );
  $: companionCharacters = visibleCharacters.filter(
    ({ character }) => character.display.area !== 'assist'
  );
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
</script>

<svelte:head>
  <title>{formatDocumentTitle(m.player_title())}</title>
  <meta name="description" content={m.player_meta_description()} />
</svelte:head>

<header class="player-page__heading mb-6 max-w-[760px]">
  <p class="kicker">{m.player_eyebrow()}</p>
  <h1
    class="text-foreground m-0 mb-3 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold wrap-anywhere"
  >
    {m.player_title()}
  </h1>
  <p class="text-muted-foreground m-0 text-sm leading-relaxed">{m.player_description()}</p>
</header>

<PlayerUidForm
  bind:value={draftUid}
  busy={state === 'loading'}
  errorMessage={formErrorMessage}
  onSubmit={submitUid}
  onInput={() => (localError = null)}
/>

<p class="player-page__data-source text-muted-foreground m-0 mb-6 text-xs leading-relaxed">
  {m.player_data_source_prefix()}<a href="https://enka.network/">Enka.Network</a
  >{m.player_data_source_suffix()}
</p>

{#if state === 'idle'}
  <Empty.Root class="player-query-state min-h-24 border p-4 md:p-4" aria-live="polite">
    <Empty.Description>{m.player_idle()}</Empty.Description>
  </Empty.Root>
{:else if state === 'loading'}
  <Empty.Root
    class="player-query-state min-h-24 flex-row gap-3 border p-4 md:p-4"
    role="status"
    aria-live="polite"
  >
    <Spinner
      class="text-primary shrink-0"
      aria-hidden="true"
      role={undefined}
      aria-label={undefined}
    />
    <Empty.Description>{m.player_loading()}</Empty.Description>
  </Empty.Root>
{:else if state === 'error'}
  <Alert.Root
    class="player-query-state player-query-state--error"
    variant="destructive"
    role={undefined}
    aria-live="assertive"
  >
    <Alert.Description>{requestErrorMessage}</Alert.Description>
  </Alert.Root>
{:else if profile}
  <PlayerHero {profile} {avatarUrl} />

  <section class="player-characters" aria-labelledby="player-support-characters">
    <SectionHeading level={1} id="player-support-characters">
      {m.player_support_characters()}
    </SectionHeading>

    {#if supportCharacters.length}
      <div class="player-characters__support-grid">
        {#each supportCharacters as item (item.character.buildId)}
          {#if item.entry}
            <CharacterOverviewCard
              entry={item.entry}
              href={playerCharacterHref(
                item.character.characterId,
                profile.uid,
                item.character.buildId
              )}
              imageUrl={getCharacterPreviewUrl(item.character.characterId)}
              density="compact"
            />
          {:else}
            <UnknownPlayerCharacterCard characterId={item.character.characterId} />
          {/if}
        {/each}
      </div>
    {:else}
      <p class="player-characters__empty">{m.player_support_characters_empty()}</p>
    {/if}
  </section>

  <section class="player-characters" aria-labelledby="player-companion-characters">
    <SectionHeading level={1} id="player-companion-characters">
      {m.player_companion_characters()}
    </SectionHeading>

    {#if companionCharacters.length}
      <OverviewGrid variant="character">
        {#each companionCharacters as item (item.character.buildId)}
          {#if item.entry}
            <CharacterOverviewCard
              entry={item.entry}
              href={playerCharacterHref(
                item.character.characterId,
                profile.uid,
                item.character.buildId
              )}
              imageUrl={getCharacterPreviewUrl(item.character.characterId)}
              density="compact"
            />
          {:else}
            <UnknownPlayerCharacterCard characterId={item.character.characterId} />
          {/if}
        {/each}
      </OverviewGrid>
    {:else}
      <p class="player-characters__empty">{m.player_companion_characters_empty()}</p>
    {/if}
  </section>
{/if}

<style>
  .player-characters {
    margin-top: var(--space-8);
  }

  .player-characters__support-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.85rem;
  }

  .player-characters__empty {
    margin: var(--space-4) 0 0;
    border: 1px dashed var(--border);
    border-radius: var(--radius-panel);
    padding: var(--space-4);
    color: var(--text-body);
    text-align: center;
  }

  @media (min-width: 821px) {
    .player-characters__support-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
