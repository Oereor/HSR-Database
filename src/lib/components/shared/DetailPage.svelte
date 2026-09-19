<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import BaseStatsPanel from '$lib/components/shared/BaseStatsPanel.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SkillCardPanel from '$lib/components/character/SkillCardPanel.svelte';
  import SpecialEffectDialog from '$lib/components/character/SpecialEffectDialog.svelte';
  import SuperimpositionPanel from '$lib/components/light-cone/SuperimpositionPanel.svelte';
  import TraceCardPanel from '$lib/components/character/TraceCardPanel.svelte';
  import DetailArtwork from '$lib/components/shared/DetailArtwork.svelte';
  import RarityStars from '$lib/components/shared/RarityStars.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import SectionNav from '$lib/components/shared/SectionNav.svelte';
  import EnemyDetailPage from '$lib/components/enemy/EnemyDetailPage.svelte';
  import RelicDetailPage from '$lib/components/relic/RelicDetailPage.svelte';
  import EquipmentRecommendationSection from '$lib/components/character/EquipmentRecommendationSection.svelte';
  import EidolonCard from '$lib/components/character/EidolonCard.svelte';
  import PlayerStatsPanel from '$lib/components/player/PlayerStatsPanel.svelte';
  import PlayerCharacterContextNotice from '$lib/components/player/PlayerCharacterContextNotice.svelte';
  import PlayerEquipmentSection from '$lib/components/player/PlayerEquipmentSection.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    getCharacterPortraitUrl,
    getCharacterPreviewUrl,
    getLightConePortraitUrl
  } from '$lib/data/visual-assets';
  import type { CatalogEntry, RelicProperty } from '$lib/domain/types';
  import type { EquipmentRecommendationView } from '$lib/domain/equipment-recommendation-view';
  import { formatDocumentTitle } from '$lib/site';
  import { localizedHref, trailingSlashHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import { fetchPlayerProfile } from '$lib/player/client';
  import type { PlayerCharacter } from '$lib/player/contract';
  import { findPlayerCharacter, resolvePlayerEidolonState } from '$lib/player/character';
  import { readPlayerUidQuery, type PlayerUidQueryState } from '$lib/player/resolve';
  export let detail: any;
  export let category: string;
  export let singular: string;
  export let specialEffectTargets: CatalogEntry[] = [];
  export let equipmentRecommendation: EquipmentRecommendationView | undefined = undefined;
  export let relicProperties: RelicProperty[] = [];
  let specialEffectsOpen = false;
  let specialEffectTrigger: HTMLButtonElement | undefined;
  let specialEffectLevel = 1;
  type PlayerContextState = 'idle' | 'invalid' | 'loading' | 'error' | 'missing' | 'active';
  let playerClientReady = false;
  let handledPlayerContext: string | null = null;
  let playerRequestVersion = 0;
  let playerContextState: PlayerContextState = 'idle';
  let playerUid: string | undefined;
  let playerCharacter: PlayerCharacter | null = null;

  onMount(() => (playerClientReady = true));

  $: plainName = gameTextToPlain(detail.name);
  $: metaDescription = gameTextToPlain(
    detail.description || m.detail_meta_fallback({ name: plainName, category: singular })
  )
    .replace(/\s+/g, ' ')
    .trim();
  $: hasEnhancedProfile = category === 'characters' && !!detail.profiles?.enhanced;
  $: enhancedEnabled =
    hasEnhancedProfile && (!browser || $page.url.searchParams.get('enhanced') !== '0');
  $: profileMode = enhancedEnabled ? 'enhanced' : 'base';
  $: activeProfile =
    category === 'characters'
      ? enhancedEnabled
        ? detail.profiles.enhanced
        : detail.profiles.base
      : undefined;
  $: specialEffects = activeProfile?.specialEffects ?? [];
  $: specialEffectsAvailable = specialEffects.length > 0;
  $: specialEffectIconUrl =
    category === 'characters' ? getCharacterPreviewUrl(detail.id) : undefined;
  $: characterPortraitSource =
    category === 'characters' ? getCharacterPortraitUrl(detail.id) : undefined;
  $: lightConePortraitSource =
    category === 'light-cones' ? getLightConePortraitUrl(detail.id) : undefined;
  $: if (specialEffectsOpen && !specialEffectsAvailable) specialEffectsOpen = false;
  $: characterSectionNavItems = [
    { id: 'stats', label: m.detail_stats() },
    { id: 'skills', label: m.detail_skills() },
    { id: 'traces', label: m.detail_traces() },
    { id: 'eidolons', label: m.detail_eidolons() },
    ...(equipmentRecommendation
      ? [
          activePlayerCharacter
            ? { id: 'equipment', label: m.player_equipment_title() }
            : { id: 'equipment-recommendation', label: m.detail_equipment_recommendation() }
        ]
      : [])
  ];
  $: playerQueryState =
    playerClientReady && category === 'characters'
      ? readPlayerUidQuery($page.url.searchParams)
      : ({ kind: 'idle', input: '' } satisfies PlayerUidQueryState);
  $: playerContextKey = playerClientReady
    ? `${category}:${detail.id}:${JSON.stringify($page.url.searchParams.getAll('uid'))}`
    : `${category}:${detail.id}:idle`;
  $: if (playerClientReady) synchronizePlayerContext(playerContextKey, playerQueryState);
  $: activePlayerCharacter = playerContextState === 'active' ? playerCharacter : null;

  function openSpecialEffects(trigger: HTMLButtonElement, level: number) {
    specialEffectTrigger = trigger;
    specialEffectLevel = level;
    specialEffectsOpen = true;
  }

  function requestSpecialEffectsClose() {
    specialEffectsOpen = false;
  }

  async function handleSpecialEffectsClosed() {
    await tick();
    if (specialEffectTrigger?.isConnected) specialEffectTrigger.focus();
    specialEffectTrigger = undefined;
  }

  async function toggleEnhanced() {
    if (specialEffectsOpen) specialEffectsOpen = false;
    const params = new URLSearchParams($page.url.searchParams);
    if (enhancedEnabled) params.set('enhanced', '0');
    else params.delete('enhanced');
    const query = params.toString();
    await goto(
      `${trailingSlashHref($page.url.pathname)}${query ? `?${query}` : ''}${$page.url.hash}`,
      {
        replaceState: true,
        noScroll: true,
        keepFocus: true
      }
    );
  }

  function synchronizePlayerContext(key: string, query: PlayerUidQueryState): void {
    if (handledPlayerContext === key) return;
    handledPlayerContext = key;
    playerRequestVersion += 1;
    const version = playerRequestVersion;
    playerCharacter = null;
    playerUid = query.kind === 'valid' ? query.uid : undefined;

    if (query.kind === 'idle') {
      playerContextState = 'idle';
      return;
    }
    if (query.kind === 'invalid') {
      playerContextState = 'invalid';
      return;
    }

    playerContextState = 'loading';
    const characterId = String(detail.id);
    void fetchPlayerProfile(query.uid)
      .then((profile) => {
        if (playerRequestVersion !== version) return;
        const resolved = findPlayerCharacter(profile, characterId);
        if (!resolved) {
          playerContextState = 'missing';
          return;
        }
        playerCharacter = resolved;
        playerContextState = 'active';
      })
      .catch(() => {
        if (playerRequestVersion !== version) return;
        playerContextState = 'error';
      });
  }
</script>

<svelte:head>
  <title>{formatDocumentTitle(plainName, singular)}</title>
  <meta name="description" content={metaDescription} />
</svelte:head>

<a class="back-link" href={localizedHref(`/${category}`)}
  >← {m.detail_back_to_list({ category: singular })}</a
>
{#if category === 'characters'}
  <header class="detail-profile-hero detail-profile-hero--character">
    <div class="detail-profile-hero__identity">
      <DetailArtwork
        source={characterPortraitSource}
        width={960}
        height={960}
        fit="cover"
        data-character-portrait={detail.id}
      />
      <div class="detail-profile-hero__gradient" aria-hidden="true"></div>
      <div class="hero-identity-copy">
        <p class="kicker">{singular.toUpperCase()} / ID {detail.id}</p>
        <h1><GameText text={detail.name} /></h1>
        {#if detail.fullName && detail.fullName !== detail.name}<p class="detail-subtitle">
            <GameText text={detail.fullName} />
          </p>{/if}
        <div class="hero-identity-metadata">
          {#if detail.rarity}<RarityStars rarity={detail.rarity} size="hero" />{/if}
          {#if detail.pathName}<SemanticIconLabel
              kind="path"
              code={detail.path}
              label={detail.pathName}
              size="hero"
              presentation="path-identity"
            />{/if}
          {#if detail.elementName}<SemanticIconLabel
              kind="element"
              code={detail.element}
              label={detail.elementName}
              color={getElementColor(detail.element)}
              size="hero"
              presentation="character-element-identity"
            />{/if}
        </div>
        {#if playerContextState !== 'idle'}
          <PlayerCharacterContextNotice state={playerContextState} uid={playerUid} />
        {/if}
        {#if hasEnhancedProfile}<div class="enhancement-control">
            <span>{m.detail_enhancement()}</span>
            <button
              class="enhancement-switch"
              type="button"
              role="switch"
              aria-label={m.detail_enhancement()}
              aria-checked={enhancedEnabled}
              on:click={toggleEnhanced}
            >
              <span class="enhancement-switch__track" aria-hidden="true"><span></span></span>
              <strong
                >{enhancedEnabled ? m.detail_enhanced_after() : m.detail_enhanced_before()}</strong
              >
            </button>
          </div>{/if}
        <div class="hero-description">
          {#if detail.description}<p><GameText text={detail.description} /></p>{:else}<p
              class="muted"
            >
              {m.detail_intro_unavailable()}
            </p>{/if}
        </div>
      </div>
    </div>
    <aside
      id="stats"
      class="detail-profile-hero__inspection section-nav-target"
      aria-label={m.detail_stats_aria()}
    >
      {#if playerContextState === 'loading'}
        <p class="data-placeholder" aria-live="polite">{m.player_character_loading()}</p>
      {:else if activePlayerCharacter}
        <PlayerStatsPanel
          stats={activePlayerCharacter.stats}
          properties={relicProperties}
          progression={detail.baseStats}
          level={activePlayerCharacter.progression.level}
          promotion={activePlayerCharacter.progression.promotion}
          controlId={`character-level-${detail.id}`}
        />
      {:else}
        <BaseStatsPanel
          progression={detail.baseStats}
          energy={activeProfile.energy}
          controlId={`character-level-${detail.id}`}
        />
      {/if}
    </aside>
  </header>
{:else if category === 'light-cones'}
  <header class="detail-profile-hero detail-profile-hero--light-cone">
    <div class="detail-profile-hero__identity">
      <DetailArtwork
        source={lightConePortraitSource}
        width={689}
        height={960}
        fit="contain"
        data-light-cone-portrait={detail.id}
      />
      <div class="hero-identity-copy">
        <p class="kicker">{singular.toUpperCase()} / ID {detail.id}</p>
        <h1><GameText text={detail.name} /></h1>
        <div class="hero-identity-metadata">
          {#if detail.rarity}<RarityStars rarity={detail.rarity} size="hero" />{/if}
          {#if detail.pathName}<SemanticIconLabel
              kind="path"
              code={detail.path}
              label={detail.pathName}
              size="hero"
              presentation="path-identity"
            />{/if}
        </div>
      </div>
    </div>
    <aside class="detail-profile-hero__inspection" aria-label={m.detail_light_cone_stats_aria()}>
      <BaseStatsPanel
        progression={detail.baseStats}
        controlId={`light-cone-level-${detail.id}`}
        controlLabel={m.detail_light_cone_level()}
      />
      <div class="detail-inspection-divider" aria-hidden="true"></div>
      {#if detail.passive.superimposition.levels.length}<SuperimpositionPanel
          passive={detail.passive}
          lightConeId={detail.id}
        />{:else}<p class="data-placeholder">{m.detail_superimposition_unavailable()}</p>{/if}
    </aside>
  </header>
{:else if category === 'relics'}
  <RelicDetailPage {detail} {singular} />
{/if}

{#if category === 'characters'}
  <SectionNav items={characterSectionNavItems} />
  {#key `${detail.id}:${profileMode}:${playerContextState}:${playerUid ?? ''}`}
    <section id="skills" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_skills()}</SectionHeading>
      {#if activeProfile.skillCards.length}<div class="stack-list skill-card-grid">
          {#each activeProfile.skillCards as card (card.category)}<SkillCardPanel
              {card}
              {specialEffectsAvailable}
              {specialEffectIconUrl}
              onOpenSpecialEffects={openSpecialEffects}
              playerSkillTree={activePlayerCharacter?.skillTree}
            />{/each}
        </div>{:else}<p class="data-placeholder">{m.detail_skills_unavailable()}</p>{/if}
    </section>
    <section id="traces" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_traces()}</SectionHeading>
      {#if activeProfile.traces.length}<TraceCardPanel
          traces={activeProfile.traces}
          playerSkillTree={activePlayerCharacter?.skillTree}
        />{:else}<p class="data-placeholder">
          {m.detail_traces_unavailable()}
        </p>{/if}
    </section>
    <section id="eidolons" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_eidolons()}</SectionHeading>
      {#if activeProfile.eidolons.length}<div class="stack-list">
          {#each activeProfile.eidolons as rank (rank.id)}<EidolonCard
              eidolon={rank}
              playerState={activePlayerCharacter
                ? resolvePlayerEidolonState(rank, activePlayerCharacter.progression.rank)
                : undefined}
            />{/each}
        </div>{:else}<p class="data-placeholder">{m.detail_eidolons_unavailable()}</p>{/if}
    </section>
  {/key}
  {#if activePlayerCharacter}
    <PlayerEquipmentSection
      character={activePlayerCharacter}
      recommendation={equipmentRecommendation}
      {relicProperties}
    />
  {:else if equipmentRecommendation}
    <EquipmentRecommendationSection recommendation={equipmentRecommendation} />
  {/if}
  {#if specialEffectsAvailable}<SpecialEffectDialog
      open={specialEffectsOpen}
      entries={specialEffects}
      targets={specialEffectTargets}
      ownerCharacterId={detail.id}
      selectedLevel={specialEffectLevel}
      onRequestClose={requestSpecialEffectsClose}
      onClosed={handleSpecialEffectsClosed}
    />{/if}
{:else if category === 'light-cones'}
  <section class="detail-section prose">
    <SectionHeading level={1}>{m.detail_story()}</SectionHeading>
    <p class:muted={!detail.story}>
      <GameText text={detail.story || m.detail_story_unavailable()} />
    </p>
  </section>
{:else if category === 'enemies'}
  {#key detail.id}<EnemyDetailPage {detail} />{/key}
{/if}
