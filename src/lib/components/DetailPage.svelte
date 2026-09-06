<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import BaseStatsPanel from '$lib/components/BaseStatsPanel.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import SkillCardPanel from '$lib/components/SkillCardPanel.svelte';
  import SpecialEffectDialog from '$lib/components/SpecialEffectDialog.svelte';
  import SuperimpositionPanel from '$lib/components/SuperimpositionPanel.svelte';
  import TraceCardPanel from '$lib/components/TraceCardPanel.svelte';
  import DetailArtwork from '$lib/components/DetailArtwork.svelte';
  import RarityStars from '$lib/components/RarityStars.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import SectionNav from '$lib/components/SectionNav.svelte';
  import EnemyDetailPage from '$lib/components/enemy/EnemyDetailPage.svelte';
  import RelicDetailPage from '$lib/components/relic/RelicDetailPage.svelte';
  import EquipmentRecommendationSection from '$lib/components/EquipmentRecommendationSection.svelte';
  import EidolonCard from '$lib/components/EidolonCard.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    getCharacterPortraitUrl,
    getCharacterPreviewUrl,
    getLightConePortraitUrl
  } from '$lib/data/visual-assets';
  import type { CatalogEntry } from '$lib/domain/types';
  import type { EquipmentRecommendationView } from '$lib/domain/equipment-recommendation-view';
  import { formatDocumentTitle } from '$lib/site';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  export let detail: any;
  export let category: string;
  export let singular: string;
  export let specialEffectTargets: CatalogEntry[] = [];
  export let equipmentRecommendation: EquipmentRecommendationView | undefined = undefined;
  let specialEffectsOpen = false;
  let specialEffectTrigger: HTMLButtonElement | undefined;
  let specialEffectLevel = 1;

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
      ? [{ id: 'equipment-recommendation', label: m.detail_equipment_recommendation() }]
      : [])
  ];

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
    await goto(`${$page.url.pathname}${query ? `?${query}` : ''}${$page.url.hash}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true
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
      <BaseStatsPanel
        progression={detail.baseStats}
        energy={activeProfile.energy}
        controlId={`character-level-${detail.id}`}
      />
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
  {#key profileMode}
    <section id="skills" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_skills()}</SectionHeading>
      {#if activeProfile.skillCards.length}<div class="stack-list skill-card-grid">
          {#each activeProfile.skillCards as card (card.category)}<SkillCardPanel
              {card}
              {specialEffectsAvailable}
              {specialEffectIconUrl}
              onOpenSpecialEffects={openSpecialEffects}
            />{/each}
        </div>{:else}<p class="data-placeholder">{m.detail_skills_unavailable()}</p>{/if}
    </section>
    <section id="traces" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_traces()}</SectionHeading>
      {#if activeProfile.traces.length}<TraceCardPanel traces={activeProfile.traces} />{:else}<p
          class="data-placeholder"
        >
          {m.detail_traces_unavailable()}
        </p>{/if}
    </section>
    <section id="eidolons" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_eidolons()}</SectionHeading>
      {#if activeProfile.eidolons.length}<div class="stack-list">
          {#each activeProfile.eidolons as rank (rank.id)}<EidolonCard eidolon={rank} />{/each}
        </div>{:else}<p class="data-placeholder">{m.detail_eidolons_unavailable()}</p>{/if}
    </section>
  {/key}
  {#if equipmentRecommendation}<EquipmentRecommendationSection
      recommendation={equipmentRecommendation}
    />{/if}
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
