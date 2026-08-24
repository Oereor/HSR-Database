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
  import SkillExtraEffects from '$lib/components/SkillExtraEffects.svelte';
  import CharacterPortrait from '$lib/components/CharacterPortrait.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import EnemyDetailPage from '$lib/components/enemy/EnemyDetailPage.svelte';
  import EquipmentRecommendationSection from '$lib/components/EquipmentRecommendationSection.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { relicTypeNames } from '$lib/domain/constants';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import { getCharacterPreviewUrl } from '$lib/data/visual-assets';
  import type { CatalogEntry } from '$lib/domain/types';
  import type { EquipmentRecommendationView } from '$lib/domain/equipment-recommendation-view';
  export let detail: any;
  export let category: string;
  export let singular: string;
  export let specialEffectTargets: CatalogEntry[] = [];
  export let equipmentRecommendation: EquipmentRecommendationView | undefined = undefined;
  let portraitAvailable = false;
  let specialEffectsOpen = false;
  let specialEffectTrigger: HTMLButtonElement | undefined;
  let specialEffectLevel = 1;

  $: plainName = gameTextToPlain(detail.name);
  $: metaDescription = gameTextToPlain(
    detail.description || `${plainName}的${singular}资料与关联数据。`
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
  $: if (specialEffectsOpen && !specialEffectsAvailable) specialEffectsOpen = false;

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
  <title>{plainName}｜{singular}｜星轨档案库</title>
  <meta name="description" content={metaDescription} />
</svelte:head>

<a class="back-link" href={`/${category}`}>← 返回{singular}列表</a>
{#if category !== 'enemies'}<header
    class:detail-hero--with-portrait={category === 'characters' && portraitAvailable}
    class="detail-hero"
  >
    <div class="detail-hero__content">
      <p class="kicker">{singular.toUpperCase()} / ID {detail.id}</p>
      <h1><GameText text={detail.name} /></h1>
      {#if detail.fullName && detail.fullName !== detail.name}<p class="detail-subtitle">
          <GameText text={detail.fullName} />
        </p>{/if}
      <div class="tag-row">
        {#if detail.rarity}<span class="tone-rarity">{'★'.repeat(detail.rarity)}</span>{/if}
        {#if detail.pathName}<SemanticIconLabel
            kind="path"
            code={detail.path}
            label={detail.pathName}
          />{/if}
        {#if detail.elementName}<SemanticIconLabel
            kind="element"
            code={detail.element}
            label={detail.elementName}
            color={getElementColor(detail.element)}
          />{/if}
        {#if detail.typeName}<span>{detail.typeName}</span>{/if}
        {#if detail.version}<span>版本 {detail.version}</span>{/if}
        {#if detail.rank}<span>{detail.rank}</span>{/if}
      </div>
      {#if hasEnhancedProfile}<div class="enhancement-control">
          <span>角色加强</span>
          <button
            class="enhancement-switch"
            type="button"
            role="switch"
            aria-label="角色加强"
            aria-checked={enhancedEnabled}
            on:click={toggleEnhanced}
          >
            <span class="enhancement-switch__track" aria-hidden="true"><span></span></span>
            <strong>{enhancedEnabled ? '加强后' : '加强前'}</strong>
          </button>
        </div>{/if}
      {#if detail.description}<p><GameText text={detail.description} /></p>{:else}<p class="muted">
          上游数据未提供可用简介。
        </p>{/if}
    </div>
    {#if category === 'characters'}<CharacterPortrait
        characterId={detail.id}
        onAvailabilityChange={(available) => (portraitAvailable = available)}
      />{/if}
  </header>{/if}

{#if category === 'characters'}
  <nav class="detail-tabs" aria-label="详情章节">
    <a href="#stats">属性</a><a href="#skills">技能</a><a href="#traces">行迹</a><a href="#eidolons"
      >星魂</a
    ><a href="#equipment-recommendation">装备推荐</a>
  </nav>
  <section id="stats" class="detail-section">
    <div class="section-heading">
      <h2>基础属性与晋阶</h2>
    </div>
    <BaseStatsPanel
      progression={detail.baseStats}
      energy={activeProfile.energy}
      controlId={`character-level-${detail.id}`}
    />
  </section>
  {#key profileMode}
    <section id="skills" class="detail-section">
      <div class="section-heading">
        <h2>技能</h2>
        <span>{activeProfile.skillCards.length} 类</span>
      </div>
      {#if activeProfile.skillCards.length}<div class="stack-list skill-card-grid">
          {#each activeProfile.skillCards as card (card.category)}<SkillCardPanel
              {card}
              {specialEffectsAvailable}
              {specialEffectIconUrl}
              onOpenSpecialEffects={openSpecialEffects}
            />{/each}
        </div>{:else}<p class="data-placeholder">上游未提供可展示的技能记录。</p>{/if}
    </section>
    <section id="traces" class="detail-section">
      <div class="section-heading">
        <h2>行迹</h2>
        <span>{activeProfile.traces.length} 条记录</span>
      </div>
      {#if activeProfile.traces.length}<TraceCardPanel traces={activeProfile.traces} />{:else}<p
          class="data-placeholder"
        >
          上游未提供可展示的行迹记录。
        </p>{/if}
    </section>
    <section id="eidolons" class="detail-section">
      <div class="section-heading"><h2>星魂</h2></div>
      {#if activeProfile.eidolons.length}<div class="stack-list">
          {#each activeProfile.eidolons as rank (rank.id)}<article
              class="info-card rank-card"
              data-eidolon-id={rank.id}
            >
              <span class="rank-number">{rank.rank}</span>
              <div>
                <h3><GameText text={rank.name} /></h3>
                <p><GameText text={rank.description || '上游未提供本地化描述。'} /></p>
                <SkillExtraEffects effects={rank.extraEffects ?? []} />
              </div>
            </article>{/each}
        </div>{:else}<p class="data-placeholder">上游未提供可展示的星魂记录。</p>{/if}
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
  <section class="detail-section">
    <h2>基础属性</h2>
    <BaseStatsPanel
      progression={detail.baseStats}
      controlId={`light-cone-level-${detail.id}`}
      controlLabel="光锥等级"
    />
  </section>
  <section class="detail-section">
    <h2>光锥效果</h2>
    {#if detail.passive.superimposition.levels.length}<SuperimpositionPanel
        passive={detail.passive}
        lightConeId={detail.id}
      />{:else}<p class="data-placeholder">上游未提供可展示的叠影效果。</p>{/if}
  </section>
  <section class="detail-section prose">
    <h2>背景故事</h2>
    <p class:muted={!detail.story}>
      <GameText text={detail.story || '上游未提供可用的背景故事文本。'} />
    </p>
  </section>
{:else if category === 'relics'}
  <section class="detail-section">
    <h2>套装效果</h2>
    {#if detail.effects.length}<div class="stack-list">
        {#each detail.effects as effect}<article class="info-card">
            <div class="info-card__heading"><h3>{effect.required} 件套</h3></div>
            <p><GameText text={effect.description || '上游未提供可解析的套装描述。'} /></p>
          </article>{/each}
      </div>{:else}<p class="data-placeholder">上游未提供可解析的套装效果。</p>{/if}
  </section>
  <section class="detail-section">
    <h2>套装部件</h2>
    {#if detail.pieces.length}<div class="piece-grid">
        {#each detail.pieces as piece}<article class="info-card">
            <span class="piece-type">{relicTypeNames[piece.slot] || '部件类型未提供'}</span>
            <h3><GameText text={piece.name} /></h3>
            <p><GameText text={piece.description || '上游未提供该部件的文字说明。'} /></p>
          </article>{/each}
      </div>{:else}<p class="data-placeholder">上游未提供套装部件记录。</p>{/if}
  </section>
  <section class="detail-section">
    <h2>获取来源</h2>
    {#if detail.sources.length}<ul>
        {#each detail.sources as source}<li><GameText text={source} /></li>{/each}
      </ul>{:else}<p class="muted">上游数据未提供可解析的获取来源。</p>{/if}
  </section>
{:else if category === 'enemies'}
  {#key detail.id}<EnemyDetailPage {detail} />{/key}
{/if}

<aside class="source-note">
  <strong>数据来源</strong>
  <p>
    TurnBasedGameData 提供结构化数据；{category === 'enemies'
      ? '敌人立绘由现有静态资源管线按 MonsterTemplateID 同步到网站本地。'
      : category === 'characters'
        ? '角色预览图、详情立绘与装备推荐所需图标由 StarRailRes 在构建时按稳定 ID 同步。'
        : '相关视觉资源在构建时同步到网站本地。'}
  </p>
</aside>
