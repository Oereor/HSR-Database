<script lang="ts">
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import type { EndgamePeriodStatus } from '$lib/domain/endgame-view';
  export let data;

  const statusLabel = (status: EndgamePeriodStatus) =>
    ({ current: '当前', upcoming: '即将开放', historical: '历史', unknown: '时间未知' })[status];
</script>

<svelte:head>
  <title>{data.mode.label}赛期｜星轨档案库</title>
  <meta name="description" content={`浏览${data.mode.label}的当前、未来与历史赛期。`} />
</svelte:head>

<header class="endgame-page-header">
  <a class="back-link endgame-breadcrumb" href="/endgame">← Endgame</a>
</header>

<EndgameModeNav activeMode={data.mode.mode} />

<section class="endgame-mode-summary" aria-labelledby="endgame-mode-title">
  <div>
    <h1 id="endgame-mode-title">{data.mode.label}</h1>
    <p>{data.mode.description}</p>
  </div>
  <span class="count-badge">{data.mode.periods.length} 个赛期</span>
</section>

<section class="endgame-period-list" aria-label="赛期列表">
  {#each data.mode.periods as period}
    <a
      class:endgame-period-card--recommended={period.groupId === data.mode.recommendedGroupId}
      class="endgame-period-card"
      href={`/endgame/${data.mode.mode}/${period.groupId}`}
    >
      <div>
        <span class={`endgame-period-status endgame-period-status--${period.status}`}>
          {statusLabel(period.status)}
        </span>
        <h2>{period.name}</h2>
        <p>{period.dateLabel}</p>
      </div>
      <strong>{period.encounterCount} 个关卡 <span>→</span></strong>
    </a>
  {/each}
</section>
