<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import { toast } from 'svelte-sonner';
  import BaseStatsPanel from '$lib/components/shared/BaseStatsPanel.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { Switch } from '$lib/components/ui/switch';
  import SkillCardPanel from '$lib/components/character/SkillCardPanel.svelte';
  import SpecialEffectDialog from '$lib/components/character/SpecialEffectDialog.svelte';
  import SuperimpositionPanel from '$lib/components/light-cone/SuperimpositionPanel.svelte';
  import TraceCardPanel from '$lib/components/character/TraceCardPanel.svelte';
  import PlayerTracePanel from '$lib/components/character/PlayerTracePanel.svelte';
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
  import { readBoundedInitialInteger } from '$lib/domain/detail-initial-state';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    getCharacterPortraitUrl,
    getCharacterIconUrl,
    getLightConePortraitUrl
  } from '$lib/data/visual-assets';
  import type { CatalogEntry, RelicProperty } from '$lib/domain/types';
  import type { EquipmentRecommendationView } from '$lib/domain/equipment-recommendation-view';
  import { formatDocumentTitle } from '$lib/site';
  import { trailingSlashHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import { traceRequirementText } from '$lib/components/character/trace-requirements';
  import { fetchPlayerProfile } from '$lib/player/client';
  import type { PlayerCharacter } from '$lib/player/contract';
  import { findPlayerCharacter, resolvePlayerEidolonState } from '$lib/player/character';
  import {
    readPlayerBuildQuery,
    readPlayerUidQuery,
    resolveDetailBackTarget,
    type PlayerBuildQueryState,
    type PlayerUidQueryState
  } from '$lib/player/resolve';
  import TrainingSection from '$lib/components/training/TrainingSection.svelte';
  import ItemDetailModal from '$lib/components/training/ItemDetailModal.svelte';
  import { createTrainingLoader } from '$lib/data/training';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import {
    activateTrace,
    calculateCharacterTrainingTarget,
    calculateLightConeTrainingTarget,
    createDefaultCharacterTrainingTarget,
    createDefaultLightConeTrainingTarget,
    deactivateTrace,
    derivePromotion,
    reconcileCharacterLevel,
    resolveSkillTraining,
    TrainingError
  } from '$lib/domain/training/index';
  import { createTrainingSkillTargets } from '$lib/domain/training/detail-view';
  import { isToggleableTrainingNode } from '$lib/domain/training/skill-tree';
  import type {
    CharacterTrainingData,
    CharacterTrainingResult,
    CharacterTrainingTarget,
    LightConeTrainingData,
    TrainingSharedData,
    MaterialCatalog,
    MaterialView,
    MaterialDetail,
    LightConeTrainingResult
  } from '$lib/domain/training/types';
  import {
    createCharacterPreviewControls,
    updateCharacterPreviewLevel
  } from '$lib/domain/character-preview';

  export let detail: any;
  export let category: string;
  export let singular: string;
  export let specialEffectTargets: CatalogEntry[] = [];
  export let equipmentRecommendation: EquipmentRecommendationView | undefined = undefined;
  export let relicProperties: RelicProperty[] = [];
  const trainingLoader = createTrainingLoader();
  const traceNoticeId = 'training-trace-notice';
  let clientReady = false;
  let handledTrainingKey = '';
  let trainingEntityKey = '';
  let trainingRequestVersion = 0;
  let trainingLoadError: string | undefined;
  let trainingLoadState: 'loading' | 'ready' | 'error' = 'loading';
  let characterTrainingData: CharacterTrainingData | undefined;
  let characterTarget: Required<CharacterTrainingTarget> | undefined;
  let retainedCharacterLevel: number | undefined;
  let lightConeTrainingData: LightConeTrainingData | undefined;
  let trainingShared: TrainingSharedData | undefined;
  let materialCatalog: MaterialCatalog | undefined;
  let selectedMaterial: MaterialView | undefined;
  let selectedMaterialDetail: MaterialDetail | undefined;
  let materialDetailState: 'loading' | 'ready' | 'error' = 'loading';
  let materialDetailRequestVersion = 0;
  let materialDetailTrigger: HTMLButtonElement | undefined;
  let materialDetailContext = '';
  let lightConeLevel = detail.baseStats?.defaultLevel ?? 1;
  let previewLevels: Record<string, number> = {};
  let characterPreviewLevel = detail.baseStats?.defaultLevel ?? 1;
  let previewScope = '';
  let trainingScopeKey = '';
  let specialEffectsOpen = false;
  let specialEffectTrigger: HTMLButtonElement | undefined;
  let specialEffectLevel = 1;
  type PlayerContextState = 'idle' | 'invalid' | 'loading' | 'error' | 'missing' | 'active';
  let handledPlayerContext: string | null = null;
  let playerRequestVersion = 0;
  let playerContextState: PlayerContextState = 'idle';
  let playerUid: string | undefined;
  let playerCharacter: PlayerCharacter | null = null;
  const emptySearchParams = new URLSearchParams();

  onMount(() => {
    clientReady = true;
  });
  onDestroy(() => {
    trainingRequestVersion += 1;
    if (browser && category === 'characters') toast.dismiss(traceNoticeId);
    materialDetailRequestVersion += 1;
    materialDetailTrigger = undefined;
  });

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
  $: specialEffectIconUrl = category === 'characters' ? getCharacterIconUrl(detail.id) : undefined;
  $: characterPortraitSource =
    category === 'characters' ? getCharacterPortraitUrl(detail.id) : undefined;
  $: lightConePortraitSource =
    category === 'light-cones' ? getLightConePortraitUrl(detail.id) : undefined;
  $: lightConeInitialLevel =
    category === 'light-cones'
      ? readBoundedInitialInteger(
          browser ? $page.url.searchParams : emptySearchParams,
          'level',
          detail.baseStats.defaultLevel,
          detail.baseStats.minLevel,
          detail.baseStats.maxLevel
        )
      : undefined;
  $: lightConeRanks =
    category === 'light-cones'
      ? detail.passive.superimposition.levels.map(({ level }: { level: number }) => level)
      : [];
  $: lightConeInitialRank =
    category === 'light-cones' && lightConeRanks.length
      ? readBoundedInitialInteger(
          browser ? $page.url.searchParams : emptySearchParams,
          'rank',
          lightConeRanks[0],
          lightConeRanks[0],
          lightConeRanks[lightConeRanks.length - 1]
        )
      : undefined;
  $: lightConeInitialStateKey =
    category === 'light-cones'
      ? browser
        ? `${detail.id}:${$page.url.search}`
        : `${detail.id}:server`
      : '';
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
      : []),
    ...(staticTrainingEnabled ? [{ id: 'training', label: m.training_title() }] : [])
  ];
  $: playerQueryState =
    clientReady && category === 'characters'
      ? readPlayerUidQuery($page.url.searchParams)
      : ({ kind: 'idle', input: '' } satisfies PlayerUidQueryState);
  $: playerBuildQueryState =
    clientReady && category === 'characters'
      ? readPlayerBuildQuery($page.url.searchParams)
      : ({ kind: 'absent' } satisfies PlayerBuildQueryState);
  $: playerContextKey = clientReady
    ? `${category}:${detail.id}:${JSON.stringify($page.url.searchParams.getAll('uid'))}:${JSON.stringify($page.url.searchParams.getAll('build'))}`
    : `${category}:${detail.id}:idle`;
  $: if (clientReady)
    synchronizePlayerContext(playerContextKey, playerQueryState, playerBuildQueryState);
  $: activePlayerCharacter = playerContextState === 'active' ? playerCharacter : null;
  $: backTarget = resolveDetailBackTarget(
    category,
    clientReady ? $page.url.searchParams : emptySearchParams,
    getLocale()
  );

  $: staticTrainingEnabled =
    category === 'light-cones' ||
    (category === 'characters' && (!browser || !$page.url.searchParams.has('uid')));
  $: synchronizePreviews(
    `${category}:${detail.id}:${profileMode}`,
    detail.baseStats?.defaultLevel ?? 1
  );
  $: trainingKey = `${$page.url.pathname}:${category}:${detail.id}:${profileMode}:${getLocale()}:${staticTrainingEnabled}:${category === 'light-cones' ? lightConeInitialStateKey : ''}`;
  $: if (clientReady) synchronizeTraining(trainingKey);
  $: synchronizeMaterialContext(
    `${$page.url.pathname}:${category}:${detail.id}:${profileMode}:${getLocale()}:${staticTrainingEnabled}`
  );
  $: skillPreviewControls = activeProfile
    ? createCharacterPreviewControls(activeProfile.skillCards, previewLevels)
    : undefined;
  $: trainingCalculation = calculateCurrentTraining(
    characterTrainingData,
    characterTarget,
    lightConeTrainingData,
    trainingShared,
    materialCatalog,
    lightConeLevel,
    staticTrainingEnabled
  );
  $: trainingSectionState =
    trainingLoadState === 'ready' && trainingCalculation.error ? 'error' : trainingLoadState;
  $: characterTrainingResult =
    trainingCalculation.result && 'skills' in trainingCalculation.result
      ? trainingCalculation.result
      : undefined;
  $: trainingProfile = characterTrainingData?.profiles.find(
    (profile) => profile.enhancedId === characterTarget?.enhancedId
  );
  $: skillTargets = characterTrainingResult
    ? createTrainingSkillTargets(
        activeProfile.skillCards,
        trainingProfile,
        characterTrainingResult.skills,
        characterTrainingResult.target.promotion
      )
    : [];
  $: trainingLevelControl =
    category === 'characters' && detail.baseStats
      ? {
          id: `training-character-level-${detail.id}`,
          label: m.base_stats_character_level(),
          value: characterTarget?.level ?? detail.baseStats.defaultLevel,
          min: detail.baseStats.minLevel as number,
          max: detail.baseStats.maxLevel as number,
          promotion: characterTrainingResult?.target.promotion ?? 0
        }
      : undefined;
  const lightConeSectionNavItems = [
    { id: 'stats', label: m.detail_stats() },
    { id: 'training', label: m.training_title() },
    { id: 'story', label: m.detail_story() }
  ];

  function synchronizeMaterialContext(context: string): void {
    if (materialDetailContext === context) return;
    materialDetailContext = context;
    materialDetailTrigger = undefined;
    closeMaterialDetails();
  }

  function openMaterialDetails(itemId: string, trigger: HTMLButtonElement): void {
    if (!staticTrainingEnabled || materialCatalog?.locale !== getLocale()) return;
    const material = materialCatalog.materials.find((entry) => entry.id === itemId);
    if (!material) return;
    materialDetailTrigger = trigger;
    selectedMaterial = material;
    void loadMaterialDetails();
  }

  async function loadMaterialDetails(): Promise<void> {
    const itemId = selectedMaterial?.id;
    const catalog = materialCatalog;
    if (!itemId || !catalog) return;
    const version = ++materialDetailRequestVersion;
    const context = materialDetailContext;
    selectedMaterialDetail = undefined;
    materialDetailState = 'loading';
    try {
      const details = await trainingLoader.loadMaterialDetails(catalog.locale, catalog);
      if (
        version !== materialDetailRequestVersion ||
        context !== materialDetailContext ||
        selectedMaterial?.id !== itemId
      )
        return;
      const material = details.materials.find((entry) => entry.id === itemId);
      if (!material) throw new TrainingError('missing-material-detail', itemId);
      selectedMaterialDetail = material;
      materialDetailState = 'ready';
    } catch {
      if (
        version === materialDetailRequestVersion &&
        context === materialDetailContext &&
        selectedMaterial?.id === itemId
      )
        materialDetailState = 'error';
    }
  }

  function closeMaterialDetails(): void {
    materialDetailRequestVersion += 1;
    selectedMaterial = undefined;
    selectedMaterialDetail = undefined;
  }

  function handleMaterialDetailsClosed(): void {
    const trigger = materialDetailTrigger;
    const version = materialDetailRequestVersion;
    materialDetailTrigger = undefined;
    if (version === materialDetailRequestVersion && !selectedMaterial && trigger?.isConnected)
      trigger.focus({ preventScroll: true });
  }

  function synchronizePreviews(scope: string, defaultLevel: number): void {
    if (previewScope === scope) return;
    previewScope = scope;
    previewLevels = {};
    characterPreviewLevel = defaultLevel;
  }

  function synchronizeTraining(key: string): void {
    if (handledTrainingKey === key) return;
    const entityKey = `${category}:${detail.id}`;
    const entityChanged = entityKey !== trainingEntityKey;
    const scopeKey = `${entityKey}:${profileMode}:${staticTrainingEnabled}`;
    const scopeChanged = scopeKey !== trainingScopeKey;
    trainingScopeKey = scopeKey;
    trainingEntityKey = entityKey;
    handledTrainingKey = key;
    trainingRequestVersion += 1;
    if (scopeChanged) {
      retainedCharacterLevel =
        !entityChanged && category === 'characters' && staticTrainingEnabled
          ? (characterTarget?.level ?? retainedCharacterLevel)
          : undefined;
      characterTarget = undefined;
      characterTrainingData = undefined;
      lightConeTrainingData = undefined;
      if (category === 'characters') toast.dismiss(traceNoticeId);
    }
    if (category === 'light-cones')
      lightConeLevel = lightConeInitialLevel ?? detail.baseStats?.defaultLevel ?? 1;
    trainingLoadState = 'loading';
    trainingLoadError = undefined;
    if (staticTrainingEnabled) void loadTraining(key, trainingRequestVersion);
  }

  async function loadTraining(key: string, version: number): Promise<void> {
    const id = String(detail.id);
    const isCharacter = category === 'characters';
    const mode = profileMode;
    const locale = getLocale();
    try {
      const [data, shared, catalog] = await Promise.all([
        isCharacter ? trainingLoader.loadCharacter(id) : trainingLoader.loadLightCone(id),
        trainingLoader.loadShared(),
        trainingLoader.loadMaterials(locale)
      ]);
      if (version !== trainingRequestVersion || key !== handledTrainingKey) return;
      if ('avatarId' in data) {
        const profile = data.profiles.find(({ enhancedId }) =>
          mode === 'base' ? enhancedId === 0 : enhancedId !== 0
        );
        if (!profile) throw new TrainingError('unknown-profile', `${id}:${mode}`);
        if (!characterTarget) {
          const initial = createDefaultCharacterTrainingTarget(data, profile.enhancedId);
          characterTarget =
            retainedCharacterLevel === undefined
              ? initial
              : reconcileCharacterLevel(data, initial, retainedCharacterLevel);
          retainedCharacterLevel = undefined;
        }
        characterTrainingData = data;
      } else {
        createDefaultLightConeTrainingTarget(data);
        lightConeTrainingData = data;
      }
      trainingShared = shared;
      materialCatalog = catalog;
      trainingLoadState = 'ready';
    } catch (error) {
      if (version === trainingRequestVersion && key === handledTrainingKey) {
        trainingLoadState = 'error';
        trainingLoadError = error instanceof TrainingError ? error.code : 'load-failed';
      }
    }
  }

  function retryTraining(): void {
    trainingLoadState = 'loading';
    trainingLoadError = undefined;
    trainingRequestVersion += 1;
    void loadTraining(handledTrainingKey, trainingRequestVersion);
  }

  function handleCharacterTrainingLevel(level: number): void {
    if (!characterTrainingData || !characterTarget) return;
    characterTarget = reconcileCharacterLevel(characterTrainingData, characterTarget, level);
    toast.dismiss(traceNoticeId);
  }

  function handleSkillTrainingLevel(key: string, level: number): void {
    if (!characterTrainingData || !characterTarget || !trainingProfile) return;
    const node = trainingProfile.nodes.find((node) => node.key === key && node.kind === 'skill');
    if (!node) return;
    resolveSkillTraining(
      node,
      level,
      derivePromotion(characterTrainingData.promotions, characterTarget.level)
    );
    characterTarget = {
      ...characterTarget,
      trainingLevels: { ...characterTarget.trainingLevels, [key]: level }
    };
  }

  function handleTraceToggle(pointId: string): void {
    if (!characterTrainingData || !characterTarget || !trainingProfile) return;
    const node = trainingProfile.nodes.find((node) => node.pointId === pointId);
    if (!node || !isToggleableTrainingNode(node)) return;
    toast.dismiss(traceNoticeId);
    const { activeTraceIds } = characterTarget;
    if (activeTraceIds.includes(pointId)) {
      characterTarget = {
        ...characterTarget,
        activeTraceIds: deactivateTrace(trainingProfile, activeTraceIds, pointId)
      };
      return;
    }
    const transition = activateTrace(trainingProfile, activeTraceIds, pointId, {
      level: characterTarget.level,
      promotion: derivePromotion(characterTrainingData.promotions, characterTarget.level)
    });
    if (transition.ok) {
      characterTarget = { ...characterTarget, activeTraceIds: transition.activeTraceIds };
      return;
    }
    const error = transition.error;
    const description =
      error.code === 'requirements-unmet'
        ? m.training_trace_requirements_unmet({
            requirements: traceRequirementText(
              error.requiredPromotion,
              error.requiredCharacterLevel
            )
          })
        : m.training_trace_unavailable();
    toast.info(m.training_trace_notice_title(), { id: traceNoticeId, description, duration: 4000 });
  }

  function handleSkillPreviewLevel(progressionId: string, level: number): void {
    previewLevels = updateCharacterPreviewLevel(
      activeProfile.skillCards,
      previewLevels,
      progressionId,
      level
    );
  }

  function calculateCurrentTraining(
    character: CharacterTrainingData | undefined,
    target: CharacterTrainingTarget | undefined,
    cone: LightConeTrainingData | undefined,
    shared: TrainingSharedData | undefined,
    catalog: MaterialCatalog | undefined,
    level: number,
    enabled: boolean
  ): { result?: CharacterTrainingResult | LightConeTrainingResult; error?: string } {
    if (!enabled || !shared || !catalog) return {};
    try {
      const result =
        character && target
          ? calculateCharacterTrainingTarget(character, shared, target)
          : cone
            ? calculateLightConeTrainingTarget(cone, shared, {
                equipmentId: cone.equipmentId,
                level
              })
            : undefined;
      if (result) {
        const ids = new Set(catalog.materials.map((material) => material.id));
        for (const id of Object.keys(result.totalCost))
          if (!ids.has(id)) throw new TrainingError('missing-material-reference', id);
      }
      return { result };
    } catch (error) {
      return { error: error instanceof TrainingError ? error.code : 'calculation-failed' };
    }
  }

  function openSpecialEffects(trigger: HTMLButtonElement, level: number) {
    specialEffectTrigger = trigger;
    specialEffectLevel = level;
    specialEffectsOpen = true;
  }

  function requestSpecialEffectsClose() {
    specialEffectsOpen = false;
  }

  function handleSpecialEffectsClosed() {
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

  function synchronizePlayerContext(
    key: string,
    query: PlayerUidQueryState,
    buildQuery: PlayerBuildQueryState
  ): void {
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
        const resolved =
          buildQuery.kind === 'invalid'
            ? null
            : findPlayerCharacter(
                profile,
                characterId,
                buildQuery.kind === 'valid' ? buildQuery.buildId : undefined
              );
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

{#if backTarget.kind === 'player'}
  <a class="back-link" href={backTarget.href}>← {m.player_character_back_to_player()}</a>
{/if}
{#if category === 'characters'}
  <Card.Root class="gap-0 overflow-hidden p-0 shadow-none">
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
        <div class="detail-profile-hero__character-content">
          {#if playerContextState !== 'idle'}
            <div class="detail-profile-hero__player-context">
              <PlayerCharacterContextNotice state={playerContextState} uid={playerUid} />
            </div>
          {/if}
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
                <Switch
                  class="enhancement-switch"
                  checked={enhancedEnabled}
                  onCheckedChange={() => {
                    void toggleEnhanced();
                  }}
                  aria-label={m.detail_enhancement()}
                />
                <strong
                  >{enhancedEnabled
                    ? m.detail_enhanced_after()
                    : m.detail_enhanced_before()}</strong
                >
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
      </div>
      <aside
        id="stats"
        class="detail-profile-hero__inspection section-nav-target hero-basic-data-pane"
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
            level={characterPreviewLevel}
            onLevelChange={(level) => (characterPreviewLevel = level)}
            showPromotion={true}
            controlId={`character-level-${detail.id}`}
          />
        {/if}
      </aside>
    </header>
  </Card.Root>
{:else if category === 'light-cones'}
  <Card.Root class="gap-0 overflow-hidden p-0 shadow-none">
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
      <aside
        id="stats"
        class="detail-profile-hero__inspection hero-basic-data-pane section-nav-target"
        aria-label={m.detail_light_cone_stats_aria()}
      >
        {#key lightConeInitialStateKey}
          <BaseStatsPanel
            progression={detail.baseStats}
            controlId={`light-cone-level-${detail.id}`}
            controlLabel={m.detail_light_cone_level()}
            showPromotion
            level={lightConeLevel}
            onLevelChange={(level) => (lightConeLevel = level)}
          />
          <Separator class="my-4" />
          {#if detail.passive.superimposition.levels.length}<SuperimpositionPanel
              passive={detail.passive}
              lightConeId={detail.id}
              initialRank={lightConeInitialRank}
            />{:else}<p class="data-placeholder">{m.detail_superimposition_unavailable()}</p>{/if}
        {/key}
      </aside>
    </header>
  </Card.Root>
{:else if category === 'relics'}
  <RelicDetailPage {detail} {singular} />
{/if}

{#if category === 'characters'}
  <SectionNav items={characterSectionNavItems} />
  {#key `${detail.id}:${profileMode}:${playerContextState}:${playerUid ?? ''}:${playerCharacter?.buildId ?? ''}`}
    <section id="skills" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_skills()}</SectionHeading>
      {#if activeProfile.skillCards.length}<div class="skill-card-grid">
          {#each activeProfile.skillCards as card (card.category)}<SkillCardPanel
              {card}
              characterAccent={getElementColor(detail.element)}
              {specialEffectsAvailable}
              {specialEffectIconUrl}
              onOpenSpecialEffects={openSpecialEffects}
              playerSkillTree={activePlayerCharacter?.skillTree}
              previewControls={skillPreviewControls}
              onPreviewLevelChange={handleSkillPreviewLevel}
            />{/each}
        </div>{:else}<p class="data-placeholder">{m.detail_skills_unavailable()}</p>{/if}
    </section>
    <section id="traces" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_traces()}</SectionHeading>
      {#if activePlayerCharacter}
        <PlayerTracePanel
          character={activePlayerCharacter}
          path={detail.path}
          presentation={detail.profiles[
            activePlayerCharacter.progression.enhanced ? 'enhanced' : 'base'
          ]}
          accent={getElementColor(detail.element)}
          loadCharacter={trainingLoader.loadCharacter}
        />
      {:else if activeProfile.traces.length}<TraceCardPanel
          traces={activeProfile.traces}
          characterAccent={getElementColor(detail.element)}
        />{:else}<p class="data-placeholder">
          {m.detail_traces_unavailable()}
        </p>{/if}
    </section>
    <section id="eidolons" class="detail-section section-nav-target">
      <SectionHeading level={1}>{m.detail_eidolons()}</SectionHeading>
      {#if activeProfile.eidolons.length}<div class="grid grid-cols-1 gap-4">
          {#each activeProfile.eidolons as rank (rank.id)}<EidolonCard
              eidolon={rank}
              characterAccent={getElementColor(detail.element)}
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
  {#if staticTrainingEnabled}
    <TrainingSection
      state={trainingSectionState}
      errorCode={trainingCalculation.error ?? trainingLoadError}
      result={trainingCalculation.result}
      catalog={materialCatalog}
      levelControl={trainingLevelControl}
      {skillTargets}
      skillTree={trainingProfile && activeProfile
        ? {
            path: detail.path,
            profile: trainingProfile,
            presentation: activeProfile,
            accent: getElementColor(detail.element),
            onToggle: handleTraceToggle
          }
        : undefined}
      onLevelChange={handleCharacterTrainingLevel}
      onSkillTrainingLevelChange={handleSkillTrainingLevel}
      onRetry={retryTraining}
      onSelectMaterial={openMaterialDetails}
    />
  {/if}
  {#if specialEffectsAvailable}<SpecialEffectDialog
      open={specialEffectsOpen}
      entries={specialEffects}
      targets={specialEffectTargets}
      characterAccent={getElementColor(detail.element)}
      ownerCharacterId={detail.id}
      selectedLevel={specialEffectLevel}
      onRequestClose={requestSpecialEffectsClose}
      onClosed={handleSpecialEffectsClosed}
    />{/if}
{:else if category === 'light-cones'}
  <SectionNav items={lightConeSectionNavItems} />
  <TrainingSection
    state={trainingSectionState}
    errorCode={trainingCalculation.error ?? trainingLoadError}
    result={trainingCalculation.result}
    catalog={materialCatalog}
    onRetry={retryTraining}
    onSelectMaterial={openMaterialDetails}
  />
  <section id="story" class="detail-section prose section-nav-target">
    <SectionHeading level={1}>{m.detail_story()}</SectionHeading>
    <p class:muted={!detail.story}>
      <GameText text={detail.story || m.detail_story_unavailable()} />
    </p>
  </section>
{:else if category === 'enemies'}
  {#key detail.id}<EnemyDetailPage {detail} />{/key}
{/if}

{#if staticTrainingEnabled}
  <ItemDetailModal
    material={selectedMaterial}
    detail={selectedMaterialDetail}
    locale={getLocale()}
    state={materialDetailState}
    onRequestClose={closeMaterialDetails}
    onClosed={handleMaterialDetailsClosed}
    onRetry={loadMaterialDetails}
  />
{/if}
