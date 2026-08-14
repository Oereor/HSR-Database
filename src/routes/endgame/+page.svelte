<script lang="ts">
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import type { EndgameModeView } from '$lib/domain/endgame-view';
  export let data;

  const statusText = (mode: EndgameModeView) => {
    const period = mode.periods.find((candidate) => candidate.groupId === mode.recommendedGroupId);
    if (!period) return '暂无赛期数据';
    return `${period.name} · ${period.dateLabel}`;
  };
</script>

<svelte:head>
  <title>Endgame｜星轨档案库</title>
  <meta
    name="description"
    content="查看混沌回忆、虚构叙事、末日幻影与异相仲裁的真实敌方实例、弱点和配置生命值。"
  />
</svelte:head>

<header class="page-heading">
  <div>
    <p class="kicker">ENDGAME ARCHIVE</p>
    <h1>Endgame</h1>
    <p>按模式、赛期和关卡查看实际敌方实例、弱点、波次与配置生命值。</p>
  </div>
  <span class="count-badge">4 种模式</span>
</header>

<EndgameModeNav />

<section class="endgame-mode-grid" aria-label="终局模式">
  {#each data.modes as mode}
    <a class="endgame-mode-card" href={`/endgame/${mode.mode}`}>
      <span>{mode.mode.toUpperCase()}</span>
      <h2>{mode.label}</h2>
      <p>{mode.description}</p>
      <small>{statusText(mode)}</small>
      <strong>查看 {mode.periods.length} 个赛期 →</strong>
    </a>
  {/each}
</section>

<p class="source-note">
  生命值来自关卡中实际 MonsterID 的配置结果。多阶段数值按“单条生命值 ×
  阶段数”展示，不代表简单相乘后的实际击破伤害。
</p>
