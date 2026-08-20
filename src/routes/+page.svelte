<script lang="ts">
  import CharacterOverviewCard from '$lib/components/CharacterOverviewCard.svelte';
  export let data;

  const categories: Array<[string, string, string, number]> = [
    ['characters', '角色', '沿命途前行的开拓者与同伴', data.manifest.counts.characters],
    ['light-cones', '光锥', '记录记忆与力量的装备', data.manifest.counts.lightCones],
    ['relics', '遗器', '套装效果与部件资料', data.manifest.counts.relics],
    ['enemies', '敌人', '弱点、抗性、技能与出现关卡', data.manifest.counts.enemies],
    [
      'endgame',
      'Endgame',
      '四种终局模式的实际敌方实例与配置生命值',
      Object.values(data.manifest.endgame.modes).reduce(
        (total: number, mode: { encounters: number }) => total + mode.encounters,
        0
      )
    ]
  ];
</script>

<svelte:head>
  <title>星轨档案库｜崩坏：星穹铁道数据站</title>
  <meta
    name="description"
    content="基于真实游戏配置构建的崩坏：星穹铁道角色、光锥、遗器和敌人资料库。"
  />
  <meta property="og:title" content="星轨档案库" />
  <meta property="og:description" content="高密度、可搜索的崩坏：星穹铁道非官方数据资料库。" />
</svelte:head>

<section class="hero">
  <div class="hero-orbit" aria-hidden="true"><span></span></div>
  <div class="hero-copy">
    <p class="kicker">HONKAI: STAR RAIL / DATA ARCHIVE</p>
    <h1>沿着星轨，<br /><em>查清每一条数据。</em></h1>
    <p>汇总角色、光锥、遗器与敌人的真实配置。快速检索，清晰关联，为长时间查阅而设计。</p>
    <form class="hero-search" action="/search">
      <label class="sr-only" for="home-search">全局搜索</label><input
        id="home-search"
        name="q"
        placeholder="输入名称，搜索整个资料库"
      /><button>开始搜索 <span>↗</span></button>
    </form>
    <div class="hero-meta">
      <span><strong>{data.manifest.counts.characters}</strong> 角色</span><span
        ><strong>{data.manifest.counts.lightCones}</strong> 光锥</span
      ><span><strong>{data.manifest.counts.relics}</strong> 套遗器</span><span
        >更新于 commit {data.manifest.sourceCommit.slice(0, 8)}</span
      >
    </div>
  </div>
</section>

<section class="home-section">
  <div class="section-heading">
    <div>
      <p class="kicker">EXPLORE</p>
      <h2>资料分类</h2>
    </div>
  </div>
  <div class="category-grid">
    {#each categories as category}<a href={`/${category[0]}`}
        ><span class="category-index">0{categories.indexOf(category) + 1}</span>
        <h3>{category[1]}</h3>
        <p>{category[2]}</p>
        <strong>{category[3]} 条记录 <span>→</span></strong></a
      >{/each}
  </div>
</section>

<section class="home-section">
  <div class="section-heading">
    <div>
      <p class="kicker">CHARACTERS</p>
      <h2>五星角色速览</h2>
    </div>
    <a href="/characters">查看全部 →</a>
  </div>
  <div class="entity-grid entity-grid--overview entity-grid--featured">
    {#each data.featured as entry}<CharacterOverviewCard
        {entry}
        href={`/characters/${entry.id}`}
      />{/each}
  </div>
</section>

<section class="data-source-panel">
  <div>
    <p class="kicker">SOURCE & TRANSPARENCY</p>
    <h2>数据从哪里来？</h2>
  </div>
  <div>
    <p>
      网站内容由只读上游仓库 TurnBasedGameData 的 JSON
      配置经过无损解析、关联验证和轻量化生成，包括四种终局模式的实际敌方实例。页面不会在运行时读取兄弟目录。
    </p>
    <p>
      结构化资料来自 TurnBasedGameData；角色预览图由 StarRailRes index 在构建时按 ID
      同步，缺失资源使用统一占位。
    </p>
  </div>
</section>
