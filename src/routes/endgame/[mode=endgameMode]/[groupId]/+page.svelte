<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import GameText from '$lib/components/GameText.svelte';
  import AaEncounterNavigator from '$lib/components/endgame/AaEncounterNavigator.svelte';
  import BattleSection from '$lib/components/endgame/BattleSection.svelte';
  import EncounterNavigator from '$lib/components/endgame/EncounterNavigator.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgamePeriodSelector from '$lib/components/endgame/EndgamePeriodSelector.svelte';
  export let data;

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
</script>

<svelte:head>
  <title>{data.group.period.name} · {data.group.modeLabel}｜星轨档案库</title>
  <meta
    name="description"
    content={`${data.group.modeLabel}「${data.group.period.name}」的关卡敌方实例、弱点与配置生命值。`}
  />
</svelte:head>

<header class="page-heading endgame-heading">
  <div>
    <a class="back-link" href={`/endgame/${data.group.mode}`}>← {data.group.modeLabel}赛期</a>
    <p class="kicker">{data.group.mode.toUpperCase()} ENCOUNTER</p>
    <h1><GameText text={data.group.period.name} /></h1>
    <p>
      {data.group.period.dateLabel}
      {#if data.group.period.status === 'current'}<span class="endgame-inline-status">当前</span
        >{/if}
      {#if data.group.period.status === 'upcoming'}<span class="endgame-inline-status"
          >即将开放</span
        >{/if}
    </p>
  </div>
  <EndgamePeriodSelector
    mode={data.group.mode}
    periods={data.group.periods}
    selectedGroupId={data.group.period.groupId}
  />
</header>

<EndgameModeNav activeMode={data.group.mode} />

{#if data.group.mode === 'aa'}
  <AaEncounterNavigator encounters={data.group.encounters} selectedId={selectedEncounter?.id} />
{:else}
  <div class="endgame-navigator-block">
    <span>{data.group.mode === 'as' ? '难度' : '关卡'}</span>
    <EncounterNavigator
      encounters={data.group.encounters}
      selectedId={selectedEncounter?.id}
      mode={data.group.mode}
    />
  </div>
{/if}

{#if selectedEncounter}
  <section class="endgame-encounter-heading">
    <div>
      <p class="kicker">ENCOUNTER</p>
      <h2><GameText text={selectedEncounter.label} /></h2>
    </div>
    <span>{selectedEncounter.battles.length} 场战斗</span>
  </section>

  {#if data.group.mode === 'pf'}
    <p class="endgame-mode-note">
      本页按波次展示可能出现的敌人类型；运行时重复生成、生成次数与先后顺序已省略。
    </p>
  {/if}

  <div class:endgame-battle-grid--boss={bossMode} class="endgame-battle-grid">
    {#each selectedEncounter.battles as battle (battle.slot)}
      <BattleSection {battle} boss={bossMode} dense={data.group.mode === 'pf'} />
    {/each}
  </div>
{:else}
  <p class="data-placeholder">该赛期暂无可展示的关卡数据。</p>
{/if}

<p class="source-note">
  生命值、速度和韧性均来自当前关卡实际 MonsterID
  的静态配置与关卡倍率，显示时四舍五入到整数。阶段与运行时机制不会被换算为未经验证的总值。
</p>
