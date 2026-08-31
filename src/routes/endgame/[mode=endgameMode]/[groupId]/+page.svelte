<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import GameText from '$lib/components/GameText.svelte';
  import InlineDividerHeading from '$lib/components/InlineDividerHeading.svelte';
  import EndgameLocalNav from '$lib/components/endgame/EndgameLocalNav.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgameSeasonHero from '$lib/components/endgame/EndgameSeasonHero.svelte';
  import AnomalyArbitrationDetailContent from '$lib/components/endgame/modes/AnomalyArbitrationDetailContent.svelte';
  import ApocalypticShadowDetailContent from '$lib/components/endgame/modes/ApocalypticShadowDetailContent.svelte';
  import EndgameNodeSection from '$lib/components/endgame/EndgameNodeSection.svelte';
  import MocMechanicsSection from '$lib/components/endgame/modes/MocMechanicsSection.svelte';
  import PureFictionDetailContent from '$lib/components/endgame/modes/PureFictionDetailContent.svelte';
  import {
    buildAnomalyArbitrationLocalNavigation,
    buildApocalypticShadowLocalNavigation,
    buildMocLocalNavigation,
    buildPureFictionLocalNavigation
  } from '$lib/domain/endgame-navigation';
  import type { EndgameGroupView } from '$lib/domain/endgame-view';
  export let data;

  function buildLocalNavigation(group: EndgameGroupView, selectedId: string) {
    if (group.mode === 'moc') return buildMocLocalNavigation(group.encounters, selectedId);
    if (group.mode === 'pf') return buildPureFictionLocalNavigation(group.encounters, selectedId);
    if (group.mode === 'as')
      return buildApocalypticShadowLocalNavigation(group.encounters, selectedId);
    return buildAnomalyArbitrationLocalNavigation(group.encounters, selectedId);
  }

  let requestedEncounter: string | null = null;
  afterNavigate(() => {
    requestedEncounter = new URL(window.location.href).searchParams.get('encounter');
  });
  $: selectedEncounter =
    data.group.encounters.find((encounter) => encounter.id === requestedEncounter) ??
    data.group.encounters.find((encounter) => encounter.id === data.group.defaultEncounterId) ??
    data.group.encounters[0];
  $: localNavigation = selectedEncounter
    ? buildLocalNavigation(data.group, selectedEncounter.id)
    : undefined;
  $: judgmentQuadrant =
    data.group.mode === 'aa' &&
    selectedEncounter?.mode === 'aa' &&
    selectedEncounter.judgmentQuadrantKey === data.group.judgmentQuadrant?.key
      ? data.group.judgmentQuadrant
      : undefined;
</script>

<svelte:head>
  <title>{data.group.period.name} · {data.group.modeLabel}｜星轨档案库</title>
  <meta
    name="description"
    content={`${data.group.modeLabel}「${data.group.period.name}」的关卡敌方实例、弱点与配置生命值。`}
  />
</svelte:head>

<header class="endgame-page-header">
  <a class="back-link endgame-breadcrumb" href={`/endgame/${data.group.mode}`}
    >← {data.group.modeLabel}赛期</a
  >
</header>

<EndgameModeNav activeMode={data.group.mode} />
<EndgameSeasonHero period={data.group.period} />

{#if selectedEncounter && localNavigation}
  <div class="endgame-content-layout">
    <EndgameLocalNav navigation={localNavigation} />
    <div class="endgame-main-content">
      {#if data.group.mode === 'aa' && selectedEncounter.mode === 'aa'}
        <AnomalyArbitrationDetailContent encounter={selectedEncounter} {judgmentQuadrant} />
      {:else if data.group.mode === 'pf' && selectedEncounter.mode === 'pf'}
        <PureFictionDetailContent group={data.group} encounter={selectedEncounter} />
      {:else if data.group.mode === 'as' && selectedEncounter.mode === 'as'}
        <ApocalypticShadowDetailContent encounter={selectedEncounter} />
      {:else if data.group.mode === 'moc' && selectedEncounter.mode === 'moc'}
        {#if data.group.mode === 'moc' && data.group.memoryTurbulence}
          <div class="endgame-group-mechanics">
            <MocMechanicsSection mechanic={data.group.memoryTurbulence} />
          </div>
        {/if}

        <section class="moc-encounter-heading" aria-labelledby="moc-encounter-title">
          <InlineDividerHeading level={2} scale="large" id="moc-encounter-title">
            <GameText text={selectedEncounter.label} />
          </InlineDividerHeading>
        </section>

        {#if selectedEncounter.memoryTurbulence}
          <MocMechanicsSection mechanic={selectedEncounter.memoryTurbulence} />
        {/if}

        <div class="moc-node-list">
          {#each selectedEncounter.battles as battle (battle.slot)}
            <EndgameNodeSection {battle} waveLayout="paired" enemyVariant="standard" />
          {/each}
        </div>
      {/if}

      <p class="source-note">
        生命值、速度和韧性均来自当前关卡实际 MonsterID
        的静态配置与关卡倍率，显示时四舍五入到整数。阶段与运行时机制不会被换算为未经验证的总值。
      </p>
    </div>
  </div>
{:else}
  <p class="data-placeholder">该赛期暂无可展示的关卡数据。</p>
{/if}

<style>
  .moc-encounter-heading {
    min-width: 0;
    margin-bottom: var(--space-8);
  }

  .moc-node-list {
    display: grid;
    min-width: 0;
    gap: var(--space-12);
  }

  @media (max-width: 520px) {
    .moc-encounter-heading {
      margin-bottom: var(--space-6);
    }

    .moc-node-list {
      gap: var(--space-8);
    }
  }
</style>
