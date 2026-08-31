<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import GameText from '$lib/components/GameText.svelte';
  import InlineDividerHeading from '$lib/components/InlineDividerHeading.svelte';
  import EndgameLocalNav from '$lib/components/endgame/EndgameLocalNav.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgameSeasonHeader from '$lib/components/endgame/EndgameSeasonHeader.svelte';
  import EndgameSeasonHero from '$lib/components/endgame/EndgameSeasonHero.svelte';
  import AsBossMechanics from '$lib/components/endgame/as/AsBossMechanics.svelte';
  import AnomalyArbitrationMechanicsSection from '$lib/components/endgame/modes/AnomalyArbitrationMechanicsSection.svelte';
  import ApocalypticShadowMechanicsSection from '$lib/components/endgame/modes/ApocalypticShadowMechanicsSection.svelte';
  import BattleSection from '$lib/components/endgame/BattleSection.svelte';
  import EndgameEnemyGrid from '$lib/components/endgame/EndgameEnemyGrid.svelte';
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
{#if data.group.mode === 'moc' || data.group.mode === 'pf'}
  <EndgameSeasonHero period={data.group.period} />
{:else}
  <EndgameSeasonHeader
    mode={data.group.mode}
    period={data.group.period}
    periods={data.group.periods}
  />
{/if}

{#if selectedEncounter && localNavigation}
  <div class="endgame-content-layout">
    <EndgameLocalNav navigation={localNavigation} />
    <div class="endgame-main-content">
      {#if data.group.mode === 'pf' && selectedEncounter.mode === 'pf'}
        <PureFictionDetailContent group={data.group} encounter={selectedEncounter} />
      {:else}
        {#if data.group.mode === 'moc' && data.group.memoryTurbulence}
          <div class="endgame-group-mechanics">
            <MocMechanicsSection mechanic={data.group.memoryTurbulence} />
          </div>
        {/if}

        {#if selectedEncounter.mode === 'moc'}
          <section class="moc-encounter-heading" aria-labelledby="moc-encounter-title">
            <InlineDividerHeading level={2} scale="large" id="moc-encounter-title">
              <GameText text={selectedEncounter.label} />
            </InlineDividerHeading>
          </section>
        {:else if selectedEncounter.mode !== 'as'}
          <section class="endgame-encounter-heading">
            <h2><GameText text={selectedEncounter.label} /></h2>
            <span>{selectedEncounter.battles.length} 场战斗</span>
          </section>
        {/if}

        {#if selectedEncounter.mode === 'moc' && selectedEncounter.memoryTurbulence}
          <MocMechanicsSection mechanic={selectedEncounter.memoryTurbulence} />
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

        {#if selectedEncounter.mode === 'as'}
          <div class="as-battle-list">
            {#each selectedEncounter.battles as battle (battle.slot)}
              <section
                class="as-battle-section"
                id={`battle-${battle.slot}`}
                data-as-battle-slot={battle.slot}
                data-battle-slot={battle.slot}
              >
                <header class="as-battle-section__heading"><h3>战斗 {battle.slot}</h3></header>
                <div class="as-battle-section__layout">
                  <section class="as-battle-enemies" data-as-battle-enemies>
                    <h4>敌方单位</h4>
                    <div class="as-battle-enemies__groups">
                      {#each battle.stages as stage (stage.key)}
                        {#each stage.waves as wave (wave.key)}
                          <div class="as-battle-enemies__group">
                            {#if battle.stages.length > 1 || stage.waves.length > 1}
                              <p>阶段 {stage.index} · {wave.label}</p>
                            {/if}
                            <EndgameEnemyGrid enemies={wave.enemies} variant="standard" />
                          </div>
                        {/each}
                      {/each}
                    </div>
                  </section>
                  {#if battle.axiomSet || battle.bossGuide}
                    <AsBossMechanics axiomSet={battle.axiomSet} bossGuide={battle.bossGuide} />
                  {/if}
                </div>
              </section>
            {/each}
          </div>
        {:else if selectedEncounter.mode === 'moc'}
          <div class="moc-node-list">
            {#each selectedEncounter.battles as battle (battle.slot)}
              <EndgameNodeSection {battle} waveLayout="paired" enemyVariant="standard" />
            {/each}
          </div>
        {:else}
          <div class="endgame-battle-grid">
            {#each selectedEncounter.battles as battle (battle.slot)}
              <BattleSection {battle} />
            {/each}
          </div>
        {/if}
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
