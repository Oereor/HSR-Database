<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import GameText from '$lib/components/GameText.svelte';
  import EndgameLocalNav from '$lib/components/endgame/EndgameLocalNav.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgameSeasonHeader from '$lib/components/endgame/EndgameSeasonHeader.svelte';
  import AnomalyArbitrationMechanicsSection from '$lib/components/endgame/modes/AnomalyArbitrationMechanicsSection.svelte';
  import ApocalypticShadowAxiomSection from '$lib/components/endgame/modes/ApocalypticShadowAxiomSection.svelte';
  import ApocalypticShadowMechanicsSection from '$lib/components/endgame/modes/ApocalypticShadowMechanicsSection.svelte';
  import BattleSection from '$lib/components/endgame/BattleSection.svelte';
  import MocMechanicsSection from '$lib/components/endgame/modes/MocMechanicsSection.svelte';
  import PureFictionMechanicsSection from '$lib/components/endgame/modes/PureFictionMechanicsSection.svelte';
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
  $: bossMode =
    data.group.mode === 'as' ||
    selectedEncounter?.variant === 'boss-normal' ||
    selectedEncounter?.variant === 'boss-hard';
  $: localNavigation = selectedEncounter
    ? buildLocalNavigation(data.group, selectedEncounter.id)
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
  <EndgameModeNav activeMode={data.group.mode} />
  <EndgameSeasonHeader
    mode={data.group.mode}
    period={data.group.period}
    periods={data.group.periods}
  />
</header>

{#if selectedEncounter && localNavigation}
  <div class="endgame-content-layout">
    <EndgameLocalNav navigation={localNavigation} />
    <div class="endgame-main-content">
      {#if data.group.mode === 'moc' && data.group.memoryTurbulence}
        <div class="endgame-group-mechanics">
          <MocMechanicsSection mechanic={data.group.memoryTurbulence} />
        </div>
      {:else if data.group.mode === 'pf' && (data.group.fixedMechanics.length || data.group.cacophony)}
        <div class="endgame-group-mechanics">
          <PureFictionMechanicsSection
            fixedMechanics={data.group.fixedMechanics}
            cacophony={data.group.cacophony}
          />
        </div>
      {/if}

      {#if selectedEncounter.mode !== 'as'}
        <section class="endgame-encounter-heading">
          <h2><GameText text={selectedEncounter.label} /></h2>
          <span>{selectedEncounter.battles.length} 场战斗</span>
        </section>
      {/if}

      {#if selectedEncounter.mode === 'moc' && selectedEncounter.memoryTurbulence}
        <MocMechanicsSection mechanic={selectedEncounter.memoryTurbulence} />
      {:else if selectedEncounter.mode === 'pf' && selectedEncounter.baseMechanic}
        <PureFictionMechanicsSection fixedMechanics={[selectedEncounter.baseMechanic]} />
      {:else if selectedEncounter.mode === 'as' && selectedEncounter.aftertaste}
        <ApocalypticShadowMechanicsSection mechanic={selectedEncounter.aftertaste} />
      {:else if selectedEncounter.mode === 'aa'}
        <AnomalyArbitrationMechanicsSection
          traits={selectedEncounter.traits}
          judgmentQuadrant={data.group.mode === 'aa' &&
          selectedEncounter.judgmentQuadrantKey === data.group.judgmentQuadrant?.key
            ? data.group.judgmentQuadrant
            : undefined}
        />
      {/if}

      {#if data.group.mode === 'pf'}
        <p class="endgame-mode-note">
          本页按波次展示可能出现的敌人类型；运行时重复生成、生成次数与先后顺序已省略。
        </p>
      {/if}

      <div
        class:endgame-battle-grid--boss={bossMode}
        class:endgame-battle-grid--with-slot-mechanics={data.group.mode === 'as'}
        class="endgame-battle-grid"
      >
        {#each selectedEncounter.battles as battle (battle.slot)}
          <BattleSection {battle} boss={bossMode} dense={data.group.mode === 'pf'}>
            {#if 'axiomSet' in battle && battle.axiomSet}
              <ApocalypticShadowAxiomSection axiomSet={battle.axiomSet} />
            {/if}
          </BattleSection>
        {/each}
      </div>

      <p class="source-note">
        生命值、速度和韧性均来自当前关卡实际 MonsterID
        的静态配置与关卡倍率，显示时四舍五入到整数。阶段与运行时机制不会被换算为未经验证的总值。
      </p>
    </div>
  </div>
{:else}
  <p class="data-placeholder">该赛期暂无可展示的关卡数据。</p>
{/if}
